import * as vscode from 'vscode';
import { AbstractServer } from '../engine/AbstractServer';
import { AnyObject } from '../../typeing/common';
import { toResultTab, ResultTab } from './toResultTab';
import { showWebview } from '../webViews/webViewsRunner';

export interface BatchStatementResult {
    sql: string;
    success: boolean;
    data?: any;
    error?: string;
    tableName?: string | null;
}

export type CellEditHandler = (tableName: string, row: AnyObject, column: string, newValue: any) => Promise<any>;

/**
 * Hosts a single "Query Results" webview panel showing one tab per
 * statement in the most recently run batch. Supports copy (cell/row/
 * column/CSV/JSON via a native quick pick), inline cell editing for simple
 * single-table SELECTs, and client-side filter/sort in the webview itself.
 */
class ResultsPanel {
    private panel: vscode.WebviewPanel | null = null;
    private nextId = 1;
    private cellEditHandler: CellEditHandler | null = null;
    private lastTabs: ResultTab[] = [];

    setCellEditHandler(handler: CellEditHandler) {
        this.cellEditHandler = handler;
    }

    async showBatch(results: BatchStatementResult[], server: AbstractServer | null) {
        if (results.length === 0) {
            return;
        }

        const tabs = results.map((result) => toResultTab(result, this.nextId++));
        this.lastTabs = tabs;

        const panel = await this.ensurePanel();
        panel.reveal(vscode.ViewColumn.Two, true);
        panel.webview.postMessage({
            type: 'SHOW_BATCH',
            payload: {
                tabs,
                serverName: server ? server.getName() : null,
                readOnly: server ? server.readOnly : false
            }
        });
    }

    private async ensurePanel(): Promise<vscode.WebviewPanel> {
        if (this.panel) {
            return this.panel;
        }

        const panel = await showWebview('results', 'Query Results');
        this.panel = panel;

        panel.onDidDispose(() => {
            this.panel = null;
        });

        panel.webview.onDidReceiveMessage((message: AnyObject) => this.handleMessage(message));

        return panel;
    }

    private async handleMessage(message: AnyObject) {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        switch (message.type) {
        case 'COPY': {
            await vscode.env.clipboard.writeText(String(message.payload.text));
            return;
        }
        case 'CONTEXT_MENU': {
            await this.showContextMenu(message.payload);
            return;
        }
        case 'CELL_EDIT': {
            await this.handleCellEdit(message.payload);
            return;
        }
        default:
            return;
        }
    }

    private async showContextMenu(payload: AnyObject) {
        const { cellText, rowText, columnText, csvText, jsonText, markdownText } = payload;
        const choice = await vscode.window.showQuickPick([
            { label: 'Copy cell', detail: cellText, value: cellText },
            { label: 'Copy row', detail: 'as tab-separated values', value: rowText },
            { label: 'Copy column', detail: 'all visible rows, this column', value: columnText },
            { label: 'Copy visible rows as CSV', value: csvText },
            { label: 'Copy visible rows as JSON', value: jsonText },
            { label: 'Copy visible rows as Markdown table', value: markdownText }
        ], { placeHolder: 'Copy…' });

        if (choice) {
            await vscode.env.clipboard.writeText(String(choice.value));
        }
    }

    private async handleCellEdit(payload: AnyObject) {
        const { tabId, tableName, rowIndex, row, column, newValue } = payload;

        if (!this.cellEditHandler) {
            this.postCellEditResult(tabId, rowIndex, column, newValue, false, 'No active database connection.');
            return;
        }

        try {
            await this.cellEditHandler(tableName, row, column, newValue);
            this.postCellEditResult(tabId, rowIndex, column, newValue, true);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.postCellEditResult(tabId, rowIndex, column, newValue, false, message);
        }
    }

    private postCellEditResult(tabId: number, rowIndex: number, column: string, newValue: any, success: boolean, error?: string) {
        if (!this.panel) {
            return;
        }
        this.panel.webview.postMessage({
            type: 'CELL_EDIT_RESULT',
            payload: { tabId, rowIndex, column, newValue, success, error }
        });
    }
}

export const resultsPanel = new ResultsPanel();
