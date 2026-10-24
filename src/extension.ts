import * as vscode from 'vscode';
import {actionsList, ActionsList} from './extension/action';
import { CommandCallback, AbstractAction } from './extension/action/AbstractAction';
import config from './extension/action/helpers/Config';
import { manager } from './extension/Manager';
import structureProvider from './extension/StructureProvider';
import connectionsProvider from './extension/ConnectionsProvider';
import completionItemsProvider from './extension/CompletionItemsProvider';
import { setExtensionPath } from './extension/webViews/webViewsRunner';
import { markdownProvider } from './extension/providers/markdownProvider';
import { queryHistoryStore } from './extension/history/QueryHistoryStore';
import { resultsPanel } from './extension/results/ResultsPanel';
import { sqlFormattingProvider } from './extension/formatting/sqlFormattingProvider';
import { templatesProvider } from './extension/templates/TemplatesProvider';
import { insertTemplate, addCustomTemplate, deleteCustomTemplate } from './extension/action/extension.insertTemplate';

export function activate(context: vscode.ExtensionContext) {

    config.getDatabases().then((databases) => {
        manager.restoreConnections(databases);
    });

    setExtensionPath(context.extensionPath);

    queryHistoryStore.init(context.globalState);
    resultsPanel.setCellEditHandler((tableName, row, column, newValue) =>
        manager.applyCellEdit(tableName, row, column, newValue)
    );

    manager.startHealthMonitor();
    context.subscriptions.push({ dispose: () => manager.stopHealthMonitor() });

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('sql', sqlFormattingProvider),
        vscode.languages.registerDocumentRangeFormattingEditProvider('sql', sqlFormattingProvider)
    );

    context.subscriptions.push(vscode.languages.registerCompletionItemProvider('sql', completionItemsProvider, ' ', '.'));
    
    vscode.window.registerTreeDataProvider('Table', structureProvider);

    vscode.window.registerTreeDataProvider('Connections', connectionsProvider);

    vscode.window.registerTreeDataProvider('SQLTemplates', templatesProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('extension.insertTemplate', insertTemplate),
        vscode.commands.registerCommand('extension.addCustomTemplate', addCustomTemplate),
        vscode.commands.registerCommand('extension.deleteCustomTemplate', deleteCustomTemplate),
    );

    addCommand(context, 'extension.queryBuild');

    addCommand(context, 'extension.runQueryBuild');

    addCommand(context, 'extension.saveConfig');
    
    addCommand(context, 'extension.changeDB');
    
    addCommand(context, 'extension.changeServer');
    
    addCommand(context, 'extension.connectToSQLServer');

    addCommand(context, 'extension.querySQL');

    addCommand(context, 'extension.showQueryHistory');

    addCommand(context, 'extension.toggleReadOnly');

    addCommand(context, 'extension.stopQueries');

    addCommand(context, 'extension.testConnection');

    addTextEditorCommand(context, 'extension.formatSQL');
    
    addCommand(context, 'extension.queryFileSQL');

    addCommand(context, 'extension.queryFileSQLToCSV');

    addTextEditorCommand(context, 'extension.querySelectedSQL');

    addTextEditorCommand(context, 'extension.querySelectedSQLToCSV');

    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('bajdzis-database-markdown', markdownProvider));

}

function addCommand(context: vscode.ExtensionContext, name: keyof ActionsList) {
    const func = getCommandFunction(name);
    const command = vscode.commands.registerCommand(name as string, func);
    context.subscriptions.push(command);
}

function addTextEditorCommand(context: vscode.ExtensionContext, name: keyof ActionsList) {
    const func = getCommandFunction(name);
    const command = vscode.commands.registerTextEditorCommand(name as string, func);
    context.subscriptions.push(command);
}

function getCommandFunction(name: keyof ActionsList): CommandCallback {
    const actionClass = actionsList[name];
    const actionObject = new actionClass(manager);
    return actionObject.execution;
}

// this method is called when your extension is deactivated
export function deactivate() {
}
