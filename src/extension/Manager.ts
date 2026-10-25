
import * as vscode from 'vscode';
import {asciiTable} from './AsciiTable';
import { AbstractServer } from './engine/AbstractServer';
import { StatusBar } from './StatusBar';

import { factoryServer, ServerTypeName } from './factoryServer';

import structureProvider from './StructureProvider';
import connectionsProvider from './ConnectionsProvider';
import { isWriteStatement, classifyStatement } from './sql/statementClassifier';
import { extractTableName } from './sql/extractTableName';
import { buildCellUpdate, getAffectedRows } from './sql/buildCellUpdate';
import { queryHistoryStore } from './history/QueryHistoryStore';
import { resultsPanel, BatchStatementResult } from './results/ResultsPanel';

import * as csv from 'fast-csv';
import { AnyObject } from '../typeing/common';

export interface BatchOptions {
    /** Stop running further statements in the batch after the first error. Default true. */
    stopOnError?: boolean;
    /** Record each statement in the query history. Default true. */
    recordHistory?: boolean;
}

export class Manager {
    server: AbstractServer[];
    currentServer: AbstractServer | null;
    statusBar: StatusBar;
    OutputChannel: vscode.OutputChannel | null;
    currentStructure: AnyObject | null;
    /** Table name of the last single-table `SELECT * FROM x [LIMIT n]` style query, used for inline editing. */
    private lastQueriedTable: string | null;
    /** Set to true by "SQL: Stop Running Queries" to stop a batch before its next statement starts. */
    private stopRequested: boolean;
    private runningBatch: boolean;
    private healthTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly HEALTH_INTERVAL_MS = 30_000;

    constructor() {
        this.server = [];
        this.currentServer = null;
        this.statusBar = new StatusBar();
        this.OutputChannel = null;
        this.currentStructure = null;
        this.lastQueriedTable = null;
        this.stopRequested = false;
        this.runningBatch = false;
        this.outputMsg = this.outputMsg.bind(this);
        this.startHealthMonitor = this.startHealthMonitor.bind(this);
        this.stopHealthMonitor = this.stopHealthMonitor.bind(this);
    }

    startHealthMonitor() {
        this.stopHealthMonitor();
        this.healthTimer = setInterval(() => this.pingCurrentServer(), Manager.HEALTH_INTERVAL_MS);
    }

    stopHealthMonitor() {
        if (this.healthTimer !== null) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
    }

    private async pingCurrentServer() {
        if (!this.currentServer) return;
        const server = this.currentServer;
        this.statusBar.updateHealth('checking');
        this.showStatusBarOnly();
        const start = Date.now();
        try {
            await server.queryPromise('SELECT 1');
            this.statusBar.updateHealth('ok', Date.now() - start);
        } catch {
            this.statusBar.updateHealth('error');
        }
        if (this.currentServer === server) {
            this.showStatusBarOnly();
        }
    }

    private showStatusBarOnly() {
        const databaseName = this.getCurrentDatabase();
        if (this.currentServer) {
            this.statusBar.setServer(this.currentServer.getName(), this.currentServer.readOnly);
        } else {
            this.statusBar.setServer(null);
        }
        this.statusBar.setDatabase(databaseName);
    }

    showStatus(){
        const databaseName = this.getCurrentDatabase();

        if (this.currentServer) {
            this.statusBar.setServer(this.currentServer.getName(), this.currentServer.readOnly);
        } else {
            this.statusBar.updateHealth('disconnected');
            this.statusBar.setServer(null);
        }
        this.statusBar.setDatabase(databaseName);

        if(databaseName !== null){
            this.refreshStructureDataBase();
        }

        connectionsProvider.refreshList(this.server, this.currentServer);
        this.startHealthMonitor();
    }

    outputMsg (msg: string){
        this.getOutputChannel().appendLine(msg);
    }

    getOutputChannel(): vscode.OutputChannel {
        if (this.OutputChannel === null) {
            this.OutputChannel = vscode.window.createOutputChannel('database');
        }
        return this.OutputChannel;
    }

    async connectPromise (type: ServerTypeName, fields: AnyObject){
        const newServer = await factoryServer(type);
        const _this = this;
        newServer.setOutput(this.OutputChannel);
        return new Promise((resolve, reject) => {
            newServer.connectPromise(fields).then(() => {
                newServer.readOnly = Boolean(fields.readOnly);
                _this.registerNewServer(newServer);
                _this.showStatus();
                resolve(newServer);
            }).catch(reject);
        });

    }

    restoreConnections(databases: AnyObject[]){
        return databases.forEach(async (fields) => {
            const newServer = await factoryServer(fields.type);
            newServer.setOutput(this.OutputChannel);
            newServer.restoreConnection(fields).then(() => {
                newServer.name = fields.name;
                newServer.readOnly = Boolean(fields.readOnly);
                this.registerNewServer(newServer);
                this.showStatus();
            }).catch((err) => {
                vscode.window.showErrorMessage(err);
            }); 
        });
    }

    /**
     * Run one or many `;`-separated statements against the current server,
     * strictly in order (never concurrently): each statement only starts
     * once the previous one has resolved or rejected. This matters for
     * scripts where a later statement depends on an earlier one (e.g.
     * `CREATE TABLE` then `INSERT INTO` it), which a `Promise.all` based
     * runner cannot guarantee.
     *
     * Read-only connections are enforced up-front: if any statement in the
     * batch would write, the whole batch is rejected before anything runs.
     *
     * @param {string} sqlMulti - one or more `;`-separated statements
     * @param {BatchOptions} [options]
     * @return {Promise<BatchStatementResult[]>}
     */
    async runBatch(sqlMulti: string, options: BatchOptions = {}): Promise<BatchStatementResult[]> {
        const stopOnError = options.stopOnError !== false;
        const recordHistory = options.recordHistory !== false;

        if (this.currentServer === null) {
            vscode.window.showErrorMessage('Server not selected');
            return [];
        }
        const currentServer = this.currentServer;
        const cleanedSql = currentServer.removeComments(sqlMulti);
        const statements = currentServer.splitQueries(cleanedSql);

        if (currentServer.readOnly) {
            const offending = statements.filter(isWriteStatement);
            if (offending.length > 0) {
                const msg = `Blocked ${offending.length} write statement(s) on read-only connection "${currentServer.getName()}". ` +
                    'Toggle off read-only mode (SQL: Toggle Read-Only Mode) to run them.';
                vscode.window.showErrorMessage(msg);
                this.outputMsg(msg);
                return [];
            }
        }

        this.stopRequested = false;
        this.runningBatch = true;
        const results: BatchStatementResult[] = [];
        let schemaMayHaveChanged = false;

        try {
            for (const sql of statements) {
                if (this.stopRequested) {
                    results.push({ sql, success: false, error: 'Stopped before running (SQL: Stop Running Queries).' });
                    continue;
                }
                try {
                    const data = await currentServer.queryPromise(sql);
                    const tableName = extractTableName(sql);
                    results.push({ sql, success: true, data, tableName });
                    this.outputMsg(sql);
                    this.queryOutputAscii(data as AnyObject);
                    if (recordHistory) {
                        queryHistoryStore.add(sql, currentServer.getName(), currentServer.currentDatabase);
                    }
                    if (tableName) {
                        this.lastQueriedTable = tableName;
                    }
                    this.syncDatabaseAfterUse(sql, currentServer);
                    if (classifyStatement(sql) === 'ddl') {
                        schemaMayHaveChanged = true;
                    }
                } catch (errMsg) {
                    const message = errMsg instanceof Error ? errMsg.message : String(errMsg);
                    results.push({ sql, success: false, error: message });
                    this.outputMsg(`${sql}\n-- ERROR: ${message}`);
                    if (recordHistory) {
                        queryHistoryStore.add(sql, currentServer.getName(), currentServer.currentDatabase);
                    }
                    if (stopOnError) {
                        vscode.window.showErrorMessage(message);
                        break;
                    }
                }
            }
        } finally {
            this.runningBatch = false;
        }

        if (schemaMayHaveChanged && currentServer.currentDatabase !== null && currentServer === this.currentServer) {
            // Tables/columns were created, dropped or altered: reload the structure
            // tree and autocompletion data once the whole batch has settled.
            this.refreshStructureDataBase();
        }

        return results;
    }

    /**
     * A `USE name` statement run from a script switches the session's database
     * on the server; mirror that here so the status bar, the structure tree and
     * autocompletion follow along instead of staying on "Database not selected".
     */
    private syncDatabaseAfterUse(sql: string, server: AbstractServer) {
        const match = sql.trim().match(/^use\s+[`"[]?([^`"\]\s;]+)[`"\]]?\s*;?$/i);
        if (!match || server.type === 'postgres' || server.type === 'postgresSSL') {
            return;
        }
        if (server.type === 'mssql') {
            // mssql uses a connection pool; USE only affects one pooled connection.
            // Call changeDatabase() so the pool reconnects with the right database.
            server.changeDatabase(match[1]).then(() => this.showStatus()).catch(() => { /* ignore */ });
            return;
        }
        server.currentDatabase = match[1];
        this.showStatus();
    }

    /** Request that the currently running batch stop before its next statement. */
    stopRunningQueries() {
        if (this.runningBatch) {
            this.stopRequested = true;
            this.outputMsg('-- Stop requested: will not start further statements in this batch --');
        }
    }

    isRunningBatch() {
        return this.runningBatch;
    }

    getLastQueriedTable(): string | null {
        return this.lastQueriedTable;
    }

    runAsQuery(sqlMulti: string){
        this.runBatch(sqlMulti).then((results) => {
            resultsPanel.showBatch(results, this.currentServer);
        });
    }

    runAsQueryToCSV(sqlMulti: string){
        if(this.currentServer === null){
            vscode.window.showErrorMessage('Server not selected');
            return;
        }
        this.runBatch(sqlMulti).then((results) => {
            results.forEach(result => {
                if (result.success) {
                    this.queryToCSV(result.data);
                }
            });
        });
    }

    /**
     * Build and run an `UPDATE` for a single cell edited in the results grid.
     * Uses the primary key column(s) from the current table structure when
     * known, otherwise falls back to matching every original column value
     * (safer, but only works when the row's full original values were sent
     * back from the grid).
     *
     * @param {string} tableName
     * @param {AnyObject} originalRow - the full row as it was rendered
     * @param {string} column - column being changed
     * @param {any} newValue
     * @return {Promise<{}>}
     */
    applyCellEdit(tableName: string, originalRow: AnyObject, column: string, newValue: any): Promise<{}> {
        if (this.currentServer === null) {
            return Promise.reject(new Error('Server not selected'));
        }
        const currentServer = this.currentServer;
        if (currentServer.readOnly) {
            return Promise.reject(new Error('Connection is read-only. Toggle off read-only mode to edit data.'));
        }
        const structure = this.currentStructure && this.currentStructure[tableName];
        const { sql, params } = buildCellUpdate({
            tableName,
            column,
            newValue,
            originalRow,
            keyColumns: this.findPrimaryKeyColumns(structure, originalRow),
            quoteIdentifier: (name) => currentServer.getIdentifiedTableName(name),
            placeholder: (index) => currentServer.getParamPlaceholder(index)
        });

        return currentServer.queryPromise(sql, params).then((data) => {
            this.outputMsg(`${sql}  -- params: ${JSON.stringify(params)}`);
            queryHistoryStore.add(sql, currentServer.getName(), currentServer.currentDatabase);
            if (getAffectedRows(data) === 0) {
                throw new Error('No row was updated: it may have changed since this result was loaded, or the table has no primary key to identify it.');
            }
            return data;
        });
    }

    private findPrimaryKeyColumns(structure: AnyObject[] | undefined, row: AnyObject): string[] {
        if (!Array.isArray(structure)) {
            return [];
        }
        return structure
            .filter((col) => typeof col.Key === 'string' && /PRI/i.test(col.Key))
            .map((col) => col.Field)
            .filter((field) => typeof field === 'string' && Object.prototype.hasOwnProperty.call(row, field));
    }

    toggleReadOnly() {
        if (this.currentServer === null) {
            vscode.window.showErrorMessage('Server not selected');
            return;
        }
        this.currentServer.readOnly = !this.currentServer.readOnly;
        const state = this.currentServer.readOnly ? 'ON' : 'OFF';
        vscode.window.showInformationMessage(`Read-only mode is now ${state} for "${this.currentServer.getName()}".`);
        this.showStatus();
    }

    getDatabase (){
        if(!this.currentServer){
            return Promise.resolve([]);
        }
        return this.currentServer.getDatabase();
    }

    changeDatabase (name: string){
        if(!this.currentServer){
            return;
        }
        this.currentServer.changeDatabase(name).then(() => {

            const msg = `-- Database changed : ${name} --`;
            this.outputMsg('-'.repeat(msg.length));
            this.outputMsg(msg);
            this.outputMsg('-'.repeat(msg.length));
            this.showStatus();
        });
    }

    getCurrentDatabase () {
        if(this.currentServer === null){
            return null;
        }
        return this.currentServer.currentDatabase;
    }

    refreshStructureDataBase (){
        if(!this.currentServer){
            return;
        }
        const currentServer = this.currentServer;
        currentServer.refrestStructureDataBase().then((structure) => {
            this.currentStructure = structure;
            structureProvider.setStructure(structure, currentServer);
        }).catch(() => {
            structureProvider.setStructure({}, currentServer);
        });
    }

    getStructure (){
        return this.currentStructure;
    }

    getCompletionItem (): vscode.CompletionItem[]{
        const completionItems: vscode.CompletionItem[] = [];
        const databaseScructure = this.getStructure();

        if(!this.currentServer){
            return completionItems;
        }

        for( const tableName in databaseScructure ) {
            const tableItem = new vscode.CompletionItem(tableName);
            tableItem.insertText = this.currentServer.getIdentifiedTableName(tableName);
            tableItem.kind = vscode.CompletionItemKind.Class;
            tableItem.detail = 'Table';
            tableItem.documentation = databaseScructure[tableName].length + ' columns :';
            
            for( const columnName in databaseScructure[tableName] ) {
                const element = databaseScructure[tableName][columnName];
                const item = new vscode.CompletionItem(tableName + '.' + element.Field);
                
                item.kind = vscode.CompletionItemKind.Property;
                item.detail = 'Column from ' + tableName;
                item.documentation = 'Type :' + element.Type + '\n Table :' + tableName + '\n Default :' + element.Default + '\n Key :' + element.Key + '\n Extra :' + element.Extra ;
                item.insertText = element.Field;

                completionItems.push(item);

                tableItem.documentation += '\n ' + element.Field + ' (' + element.Type  + ')';

            }
            completionItems.push(tableItem);
        }
        return completionItems;
    }
    
    changeServer (server: AbstractServer){
        this.currentServer = server;
        this.currentStructure = {};
        const msg = `-- Start use server : ${server.name} --`;
        this.outputMsg('-'.repeat(msg.length));
        this.outputMsg(msg);
        this.outputMsg('-'.repeat(msg.length));

        this.showStatus();
        
    }
    
    registerNewServer (obj: AbstractServer){
        this.server.push(obj);
        this.changeServer(obj);
    }

    queryOutput(data: AnyObject, sql: string){
        this.queryOutputAscii(data);
        this.queryOutputMarkdown(data, sql);
    }
    
    queryOutputAscii (data: AnyObject){
        if(typeof data.message !== 'undefined'){
            this.outputMsg(data.message);
            asciiTable([{
                fieldCount: data.fieldCount,
                affectedRows: data.affectedRows,
                insertId: data.insertId,
                serverStatus: data.serverStatus,
                warningCount: data.warningCount,
                changedRows: data.changedRows
            }], this.outputMsg);
        }else if(typeof data === 'object' && Array.isArray(data)){
            const noResult = data.length === 0;
            if (noResult) {
                this.outputMsg('Query result 0 rows!');
            } else {
                asciiTable(data, this.outputMsg);
            }
        }else{
            this.outputMsg('ok');
        }
        // if(this.OutputChannel !== null){
        //     this.OutputChannel.show();
        // }
    }

    queryOutputMarkdown (data: AnyObject, sql: string){
        if(typeof data.message !== 'undefined'){
            this.showQueryResult({
                message: data.message,
                sql,
                data: [{
                    fieldCount: data.fieldCount,
                    affectedRows: data.affectedRows,
                    insertId: data.insertId,
                    serverStatus: data.serverStatus,
                    warningCount: data.warningCount,
                    changedRows: data.changedRows
                }]
            });
        }else if(typeof data === 'object'){
            this.showQueryResult({
                message: `Query result ${data.length} rows!`,
                sql,
                data
            });
        }else{
            this.showQueryResult({
                message: 'OK',
                sql
            });
        }

    }

    showQueryResult(data: AnyObject){
        const dataJson = encodeURI(JSON.stringify(data));
        const uri = vscode.Uri.parse(`bajdzis-database-markdown://queryResult?${dataJson}`);

        vscode.commands.executeCommand('markdown.showPreview', uri);
        vscode.commands.executeCommand('markdown.preview.refresh', uri);
    }

    queryToCSV (data: any){
        if(typeof data.message !== 'undefined'){
            this.outputMsg(data.message);
            asciiTable([{
                fieldCount: data.fieldCount,
                affectedRows: data.affectedRows,
                insertId: data.insertId,
                serverStatus: data.serverStatus,
                warningCount: data.warningCount,
                changedRows: data.changedRows
            }], this.outputMsg);
        }else if(typeof data === 'object'){
            const noResult = data.length === 0;
            if (noResult) {
                this.outputMsg('Query result 0 rows!');
            } else {
                csv.writeToString(
                    data,
                    {headers: true},
                    (err: Error, dataCSV: string) => {
                        vscode.workspace.openTextDocument().then(doc => {
                            vscode.window.showTextDocument(doc, 2, false).then(e => {
                                e.edit(edit => {
                                    edit.insert(new vscode.Position(0, 0), dataCSV);
                                });
                            });
                        }, (error) => {
                            vscode.window.showErrorMessage(error);
                        });
                    }
                );
            }
        }else{
            this.outputMsg('ok');
        }
        if(this.OutputChannel !== null){
            this.OutputChannel.show();
        }
    }
    
    changeServerAlias (newName: string){
        if(this.currentServer === null){
            return;
        }
        this.currentServer.name = newName;
        this.showStatus();
    }
}

export const manager = new Manager();

