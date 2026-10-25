import * as vscode from 'vscode';
import { AbstractAction } from './AbstractAction';

export class StopQueries extends AbstractAction
{
    execution() {
        if (!this.sqlMenager.isRunningBatch()) {
            vscode.window.showInformationMessage('No query batch is running.');
            return;
        }
        this.sqlMenager.stopRunningQueries();
    }
}
