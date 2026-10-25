import * as vscode from 'vscode';

export interface QueryHistoryEntry {
    sql: string;
    serverName: string;
    database: string | null;
    timestamp: number;
}

const STORAGE_KEY = 'database.queryHistory';
const MAX_ENTRIES = 200;

/**
 * Keeps a bounded, most-recent-first list of executed queries, persisted in
 * the extension's global state so it survives a window reload.
 */
class QueryHistoryStore {
    private context: vscode.Memento | null = null;
    private entries: QueryHistoryEntry[] = [];

    init(context: vscode.Memento) {
        this.context = context;
        this.entries = this.context.get<QueryHistoryEntry[]>(STORAGE_KEY, []);
    }

    add(sql: string, serverName: string, database: string | null) {
        const trimmed = sql.trim();
        if (!trimmed) {
            return;
        }
        this.entries = this.entries.filter((entry) => entry.sql !== trimmed);
        this.entries.unshift({
            sql: trimmed,
            serverName,
            database,
            timestamp: Date.now()
        });
        if (this.entries.length > MAX_ENTRIES) {
            this.entries.length = MAX_ENTRIES;
        }
        this.persist();
    }

    getAll(): QueryHistoryEntry[] {
        return this.entries.slice();
    }

    search(term: string): QueryHistoryEntry[] {
        const needle = term.toLowerCase();
        return this.entries.filter((entry) => entry.sql.toLowerCase().includes(needle));
    }

    clear() {
        this.entries = [];
        this.persist();
    }

    private persist() {
        if (this.context) {
            this.context.update(STORAGE_KEY, this.entries);
        }
    }
}

export const queryHistoryStore = new QueryHistoryStore();
