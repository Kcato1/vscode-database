import * as vscode from 'vscode';
import { format } from 'sql-formatter';

function getIndentSize(): number {
    const config = vscode.workspace.getConfiguration('database');
    return config.get<number>('format.indent', 4);
}

function getUppercase(): boolean {
    const config = vscode.workspace.getConfiguration('database');
    return config.get<boolean>('format.uppercaseKeywords', true);
}

/**
 * @param {string} sql
 * @return {string} the formatted SQL, or the original text unchanged if
 *                   sql-formatter fails to parse it (never throws)
 */
export function formatSql(sql: string): string {
    try {
        return format(sql, {
            indent: ' '.repeat(getIndentSize()),
            language: 'sql',
            uppercase: getUppercase()
        } as any);
    } catch (e) {
        return sql;
    }
}

class SqlFormattingProvider implements vscode.DocumentFormattingEditProvider, vscode.DocumentRangeFormattingEditProvider {

    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        return [vscode.TextEdit.replace(fullRange, formatSql(document.getText()))];
    }

    provideDocumentRangeFormattingEdits(document: vscode.TextDocument, range: vscode.Range): vscode.TextEdit[] {
        const text = document.getText(range);
        return [vscode.TextEdit.replace(range, formatSql(text))];
    }
}

export const sqlFormattingProvider = new SqlFormattingProvider();
