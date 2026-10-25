import * as vscode from 'vscode';
import { AbstractAction } from './AbstractAction';
import { formatSql } from '../formatting/sqlFormattingProvider';

export class FormatSQL extends AbstractAction
{
    execution(editor: vscode.TextEditor) {
        const target = editor || vscode.window.activeTextEditor;
        if (!target) {
            return;
        }
        const range = target.selection.isEmpty
            ? new vscode.Range(target.document.positionAt(0), target.document.positionAt(target.document.getText().length))
            : target.selection;
        const formatted = formatSql(target.document.getText(range));
        target.edit((edit) => edit.replace(range, formatted));
    }
}
