import * as vscode from 'vscode';
import { manager } from './Manager';

const SQL_KEYWORDS = [
    'SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'VALUES',
    'SET', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'ON',
    'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'AND', 'OR', 'NOT',
    'IN', 'IS NULL', 'IS NOT NULL', 'LIKE', 'BETWEEN', 'DISTINCT', 'UNION',
    'UNION ALL', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'PRIMARY KEY',
    'FOREIGN KEY', 'REFERENCES', 'DEFAULT', 'NULL', 'NOT NULL', 'AUTO_INCREMENT'
];

class CompletionItemsProvider implements vscode.CompletionItemProvider {

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const linePrefix = document.lineAt(position).text.slice(0, position.character);
        const tableColumnMatch = linePrefix.match(/([A-Za-z0-9_]+)\.\s*$/);

        if (tableColumnMatch) {
            return this.getColumnCompletionsForTable(tableColumnMatch[1]);
        }

        const afterFromOrJoin = /\b(from|join|into|update)\s+[A-Za-z0-9_`"[\]]*$/i.test(linePrefix);
        if (afterFromOrJoin) {
            return this.getTableCompletions();
        }

        return [
            ...this.getKeywordCompletions(),
            ...manager.getCompletionItem()
        ];
    }

    resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        return item;
    }

    private getKeywordCompletions(): vscode.CompletionItem[] {
        return SQL_KEYWORDS.map((keyword) => {
            const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
            item.insertText = keyword;
            item.detail = 'SQL keyword';
            return item;
        });
    }

    private getTableCompletions(): vscode.CompletionItem[] {
        const structure = manager.getStructure() || {};
        return Object.keys(structure).map((tableName) => {
            const item = new vscode.CompletionItem(tableName, vscode.CompletionItemKind.Class);
            item.detail = 'Table';
            return item;
        });
    }

    private getColumnCompletionsForTable(tableName: string): vscode.CompletionItem[] {
        const structure = manager.getStructure() || {};
        const columns = structure[tableName];
        if (!Array.isArray(columns)) {
            return [];
        }
        return columns.map((column: { Field: string; Type: string }) => {
            const item = new vscode.CompletionItem(column.Field, vscode.CompletionItemKind.Property);
            item.detail = `${column.Type} — ${tableName}`;
            return item;
        });
    }
}

const completionItemsProvider = new CompletionItemsProvider();

export default completionItemsProvider;
