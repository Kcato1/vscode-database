import * as fs from 'fs';
import * as path from 'path';
import { AbstractServer } from './AbstractServer';
import { AnyObject } from '../../typeing/common';
import { getExtensionPath } from '../webViews/webViewsRunner';

type SqlJsStatic = import('sql.js').SqlJsStatic;
type Database = import('sql.js').Database;

// sql.js is an Emscripten module that breaks when webpack rewrites its
// `module`/`exports` handling, so it is NOT bundled. Its two files ship as
// plain assets in `resources/` and are loaded with Node's own `require`.
declare const __non_webpack_require__: NodeRequire | undefined;
// Outside webpack (unit/integration tests), fall back to the module's own `require`;
// `eval` keeps webpack from trying to statically analyse that branch.
// eslint-disable-next-line no-eval
const nodeRequire: NodeRequire = typeof __non_webpack_require__ === 'function' ? __non_webpack_require__ : eval('require');

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function getSqlJs(): Promise<SqlJsStatic> {
    if (!sqlJsPromise) {
        const resources = path.join(getExtensionPath(), 'resources');
        const initSqlJs = nodeRequire(path.join(resources, 'sql-wasm.js')) as (config?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>;
        sqlJsPromise = initSqlJs({
            locateFile: (file: string) => path.join(resources, file)
        });
    }
    return sqlJsPromise;
}

const SELECT_TABLE_SQL = 'SELECT name FROM sqlite_master WHERE type = \'table\' AND name NOT LIKE \'sqlite_%\' ORDER BY name';

/**
 * SQLite support via sql.js (a WebAssembly build of SQLite). There is no
 * server to connect to: `host` is the path to a `.sqlite`/`.db` file on
 * disk. The whole database is loaded into memory and every write is
 * flushed back to that file so changes persist between queries.
 */
export class SQLiteType extends AbstractServer {

    private db?: Database;
    public filePath: string;

    constructor() {
        super();
        this.type = 'sqlite';
        this.filePath = '';
        this.currentDatabase = null;
    }

    getName() {
        if (this.name) {
            return this.name;
        }
        return `${path.basename(this.filePath)} (${this.typeName})`;
    }

    connectPromise({ host }: AnyObject): Promise<undefined> {
        this.filePath = host;
        return getSqlJs().then((SQL) => {
            const fileBuffer = fs.existsSync(this.filePath) ? fs.readFileSync(this.filePath) : undefined;
            this.db = new SQL.Database(fileBuffer);
            this.currentDatabase = path.basename(this.filePath);
            return undefined;
        });
    }

    restoreConnection(fields: AnyObject): Promise<undefined> {
        return this.connectPromise(fields);
    }

    getDataToRestore(): Promise<AnyObject> {
        return Promise.resolve({
            type: this.type,
            name: this.getName(),
            host: this.filePath,
            database: this.currentDatabase
        });
    }

    private persist() {
        if (!this.db || !this.filePath) {
            return;
        }
        const data = this.db.export();
        fs.writeFileSync(this.filePath, Buffer.from(data));
    }

    queryPromise(sql: string, params?: any[]): Promise<AnyObject[] | AnyObject> {
        if (!this.db) {
            return Promise.reject(new Error('SQLite: no open database'));
        }
        try {
            const isSelectLike = /^\s*(select|pragma|explain|with)\b/i.test(sql);
            if (isSelectLike) {
                const statement = this.db.prepare(sql);
                try {
                    if (params && params.length > 0) {
                        statement.bind(params);
                    }
                    const rows: AnyObject[] = [];
                    while (statement.step()) {
                        rows.push(statement.getAsObject());
                    }
                    // Writable CTEs and mutating PRAGMAs (e.g. PRAGMA user_version = 2)
                    // run through this path and report success but the change is only in
                    // memory unless we flush. getRowsModified() > 0 catches writable CTEs;
                    // the non-SELECT check catches PRAGMA writes that report 0 modified rows.
                    if (this.db.getRowsModified() > 0 || !/^\s*select\b/i.test(sql)) {
                        this.persist();
                    }
                    return Promise.resolve(rows);
                } finally {
                    statement.free();
                }
            }

            this.db.run(sql, params as any);
            // Read the count first: db.export() (used by persist) resets it to 0.
            const modified = this.db.getRowsModified();
            this.persist();
            return Promise.resolve({
                message: 'OK',
                affectedRows: modified,
                fieldCount: 0,
                insertId: 0,
                serverStatus: 0,
                warningCount: 0,
                changedRows: modified
            });
        } catch (e) {
            return Promise.reject(e instanceof Error ? e : new Error(String(e)));
        }
    }

    closeConnect(): Promise<void> {
        if (this.db) {
            this.db.close();
            this.db = undefined;
        }
        return Promise.resolve();
    }

    changeDatabase(): Promise<{}> {
        // SQLite has one database per file/connection; nothing to switch.
        return Promise.resolve({});
    }

    getDatabase(): Promise<string[]> {
        return Promise.resolve(this.currentDatabase ? [this.currentDatabase] : []);
    }

    getIdentifiedTableName(tableName: string): string {
        return `"${tableName.replace(/"/g, '""')}"`;
    }

    refrestStructureDataBase(): Promise<{}> {
        return this.queryPromise(SELECT_TABLE_SQL).then((tables) => {
            const tableNames = (tables as AnyObject[]).map((row) => row.name as string);
            const structure: AnyObject = {};
            const columnPromises = tableNames.map((tableName) =>
                this.queryPromise(`PRAGMA table_info(${this.getIdentifiedTableName(tableName)})`).then((columns) => {
                    structure[tableName] = (columns as AnyObject[]).map((col) => ({
                        Field: col.name,
                        Type: col.type,
                        Null: col.notnull ? 'NO' : 'YES',
                        Key: col.pk ? 'PRI' : '',
                        Default: col.dflt_value,
                        Extra: ''
                    }));
                })
            );
            return Promise.all(columnPromises).then(() => structure);
        });
    }
}

SQLiteType.prototype.typeName = 'SQLite';

SQLiteType.prototype.fieldsToConnect = [
    {
        type: 'text',
        defaultValue: '',
        name: 'host',
        title: 'Database file path',
        info: '(e.g /home/user/project/data.sqlite - created if it does not exist)'
    }
];

export default SQLiteType;
