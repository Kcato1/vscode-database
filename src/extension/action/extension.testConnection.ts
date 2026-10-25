import * as vscode from 'vscode';
import { AbstractAction } from './AbstractAction';

export class TestConnection extends AbstractAction
{
    async execution() {
        const server = this.sqlMenager.currentServer;
        if (server === null) {
            vscode.window.showErrorMessage('Server not selected');
            return;
        }
        const timings: number[] = [];
        try {
            for (let i = 0; i < 5; i++) {
                const start = Date.now();
                await server.queryPromise('SELECT 1');
                timings.push(Date.now() - start);
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Connection test failed for "${server.getName()}": ${message}`);
            return;
        }
        const avg = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
        vscode.window.showInformationMessage(
            `"${server.getName()}" OK. Round trip: avg ${avg} ms (min ${Math.min(...timings)}, max ${Math.max(...timings)}).`
        );
    }
}
