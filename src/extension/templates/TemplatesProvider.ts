import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TemplateEntry {
    name: string;
    sql: string;
    description?: string;
}

const BUILTIN_TEMPLATES: TemplateEntry[] = [
    { name: 'SELECT *', sql: 'SELECT *\nFROM table_name\nLIMIT 100;', description: 'Select all columns from a table' },
    { name: 'SELECT columns', sql: 'SELECT col1, col2\nFROM table_name\nWHERE condition\nORDER BY col1\nLIMIT 100;', description: 'Select specific columns with filter' },
    { name: 'INSERT', sql: "INSERT INTO table_name (col1, col2)\nVALUES ('value1', 'value2');", description: 'Insert a new row' },
    { name: 'UPDATE', sql: "UPDATE table_name\nSET col1 = 'value1'\nWHERE id = 1;", description: 'Update a row by id' },
    { name: 'DELETE', sql: 'DELETE FROM table_name\nWHERE id = 1;', description: 'Delete a row by id' },
    { name: 'CREATE TABLE', sql: 'CREATE TABLE table_name (\n    id INT PRIMARY KEY,\n    name VARCHAR(100) NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);', description: 'Create a new table' },
    { name: 'DROP TABLE', sql: 'DROP TABLE IF EXISTS table_name;', description: 'Drop a table if it exists' },
    { name: 'COUNT rows', sql: 'SELECT COUNT(*) AS total\nFROM table_name;', description: 'Count all rows in a table' },
    { name: 'GROUP BY', sql: 'SELECT col1, COUNT(*) AS cnt\nFROM table_name\nGROUP BY col1\nORDER BY cnt DESC;', description: 'Aggregate rows by a column' },
    { name: 'JOIN', sql: 'SELECT a.*, b.name\nFROM table_a a\nINNER JOIN table_b b ON b.id = a.b_id\nWHERE a.id = 1;', description: 'Inner join two tables' },
];

class TemplateItem extends vscode.TreeItem {
    constructor(
        public readonly entry: TemplateEntry | null,
        public readonly isCategory: boolean,
        label: string,
        collapsible: vscode.TreeItemCollapsibleState,
        public readonly category: 'builtin' | 'custom'
    ) {
        super(label, collapsible);
        if (!isCategory && entry) {
            this.tooltip = entry.description ? `${entry.description}\n\n${entry.sql}` : entry.sql;
            this.description = entry.description || '';
            this.command = {
                command: 'extension.insertTemplate',
                title: 'Insert Template',
                arguments: [entry.sql],
            };
            this.contextValue = category === 'custom' ? 'customTemplate' : 'builtinTemplate';
            this.iconPath = new vscode.ThemeIcon('code');
        } else {
            this.iconPath = new vscode.ThemeIcon(category === 'builtin' ? 'library' : 'folder-opened');
            this.contextValue = 'templateCategory';
        }
    }
}

class TemplatesProvider implements vscode.TreeDataProvider<TemplateItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TemplateItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    getTreeItem(element: TemplateItem) { return element; }

    getChildren(element?: TemplateItem): vscode.ProviderResult<TemplateItem[]> {
        if (!element) {
            return [
                new TemplateItem(null, true, 'Built-in', vscode.TreeItemCollapsibleState.Expanded, 'builtin'),
                new TemplateItem(null, true, 'Custom', vscode.TreeItemCollapsibleState.Expanded, 'custom'),
            ];
        }
        if (element.category === 'builtin' && element.isCategory) {
            return BUILTIN_TEMPLATES.map((t) =>
                new TemplateItem(t, false, t.name, vscode.TreeItemCollapsibleState.None, 'builtin')
            );
        }
        if (element.category === 'custom' && element.isCategory) {
            return this.loadCustomTemplates().map((t) =>
                new TemplateItem(t, false, t.name, vscode.TreeItemCollapsibleState.None, 'custom')
            );
        }
        return [];
    }

    refresh() { this._onDidChangeTreeData.fire(undefined); }

    loadCustomTemplates(): TemplateEntry[] {
        const file = this.customFile();
        if (!file || !fs.existsSync(file)) return [];
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8')) as TemplateEntry[];
        } catch { return []; }
    }

    saveCustomTemplates(templates: TemplateEntry[]) {
        const file = this.customFile();
        if (!file) {
            vscode.window.showErrorMessage('Open a workspace folder to save custom templates.');
            return;
        }
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
        fs.writeFileSync(file, JSON.stringify(templates, null, 2));
        this.refresh();
    }

    private customFile(): string | null {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) return null;
        return path.join(folders[0].uri.fsPath, '.vscode', 'sql-templates.json');
    }
}

export const templatesProvider = new TemplatesProvider();
