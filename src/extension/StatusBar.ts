import * as vscode from 'vscode';

export type ConnectionHealth = 'ok' | 'checking' | 'error' | 'disconnected';

export class StatusBar {
    serverStatus: vscode.StatusBarItem;
    databaseStatus: vscode.StatusBarItem;
    private health: ConnectionHealth = 'disconnected';
    private latencyMs: number | null = null;

    constructor() {
        this.serverStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.serverStatus.command = 'extension.changeServer';
        this.serverStatus.show();

        this.databaseStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this.databaseStatus.command = 'extension.changeDB';

        this.setDatabase(null);
        this.setServer(null);
    }

    setServer(name: string | null, readOnly = false) {
        const lock = readOnly ? '$(lock) ' : '';
        const healthIcon = this.healthIcon();
        const latency = this.latencyMs !== null ? ` (${this.latencyMs}ms)` : '';
        this.serverStatus.text = `$(server) ${lock}${name ? healthIcon + name + latency : 'Server not selected'}`;
        this.serverStatus.tooltip = readOnly
            ? `Read-only connection${this.latencyText()}`
            : this.latencyText() || undefined;
        if (name) {
            this.databaseStatus.show();
        } else {
            this.databaseStatus.hide();
        }
    }

    setDatabase(name: string | null) {
        this.databaseStatus.text = ' $(database) ' + (name || 'Database not selected');
    }

    updateHealth(health: ConnectionHealth, latencyMs?: number) {
        this.health = health;
        this.latencyMs = latencyMs !== undefined ? latencyMs : this.latencyMs;
    }

    private healthIcon(): string {
        switch (this.health) {
            case 'ok': return '$(pass) ';
            case 'checking': return '$(sync~spin) ';
            case 'error': return '$(warning) ';
            default: return '';
        }
    }

    private latencyText(): string {
        if (this.latencyMs === null) return '';
        return ` — last ping: ${this.latencyMs}ms`;
    }
}
