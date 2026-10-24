import * as vscode from 'vscode';
import { AbstractAction } from './AbstractAction';
import { queryHistoryStore, QueryHistoryEntry } from '../history/QueryHistoryStore';

const formatAge = (timestamp: number): string => {
    const seconds = Math.round((Date.now() - timestamp) / 1000);
    if (seconds < 60) {
        return `${seconds}s ago`;
    }
    if (seconds < 3600) {
        return `${Math.round(seconds / 60)}m ago`;
    }
    if (seconds < 86400) {
        return `${Math.round(seconds / 3600)}h ago`;
    }
    return `${Math.round(seconds / 86400)}d ago`;
};

export class ShowQueryHistory extends AbstractAction
{
    execution() {
        const entries = queryHistoryStore.getAll();
        if (entries.length === 0) {
            vscode.window.showInformationMessage('Query history is empty.');
            return;
        }

        const items = entries.map((entry: QueryHistoryEntry) => ({
            label: entry.sql.replace(/\s+/g, ' ').slice(0, 100),
            description: `${formatAge(entry.timestamp)} · ${entry.serverName}${entry.database ? ' / ' + entry.database : ''}`,
            detail: entry.sql.length > 100 ? entry.sql : undefined,
            entry
        }));

        vscode.window.showQuickPick(items, {
            placeHolder: 'Query history - Enter to run, or pick "Open in editor" afterwards',
            matchOnDescription: true,
            matchOnDetail: true
        }).then((picked) => {
            if (!picked) {
                return;
            }
            vscode.window.showQuickPick(['Run query', 'Open in editor', 'Clear all history'], {
                placeHolder: picked.entry.sql.slice(0, 80)
            }).then((action) => {
                if (action === 'Run query') {
                    this.sqlMenager.runAsQuery(picked.entry.sql);
                } else if (action === 'Open in editor') {
                    vscode.workspace.openTextDocument({ language: 'sql', content: picked.entry.sql })
                        .then((doc) => vscode.window.showTextDocument(doc));
                } else if (action === 'Clear all history') {
                    queryHistoryStore.clear();
                }
            });
        });
    }
}
