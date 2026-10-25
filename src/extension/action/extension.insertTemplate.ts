import * as vscode from 'vscode';
import { templatesProvider } from '../templates/TemplatesProvider';

export async function insertTemplate(sql: string) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        const doc = await vscode.workspace.openTextDocument({ language: 'sql', content: sql });
        await vscode.window.showTextDocument(doc);
        return;
    }
    await editor.edit((builder) => {
        const sel = editor.selection;
        if (sel.isEmpty) {
            builder.insert(sel.active, sql);
        } else {
            builder.replace(sel, sql);
        }
    });
}

export async function addCustomTemplate() {
    const name = await vscode.window.showInputBox({ prompt: 'Template name', placeHolder: 'My SELECT' });
    if (!name) return;
    const sql = await vscode.window.showInputBox({ prompt: 'SQL body', placeHolder: 'SELECT * FROM ...' });
    if (!sql) return;
    const desc = await vscode.window.showInputBox({ prompt: 'Description (optional)' });
    const templates = templatesProvider.loadCustomTemplates();
    templates.push({ name, sql, description: desc || undefined });
    templatesProvider.saveCustomTemplates(templates);
    vscode.window.showInformationMessage(`Template "${name}" saved.`);
}

export async function deleteCustomTemplate(item: { entry: { name: string } } | undefined) {
    if (!item?.entry) return;
    const templates = templatesProvider.loadCustomTemplates().filter((t) => t.name !== item.entry.name);
    templatesProvider.saveCustomTemplates(templates);
    vscode.window.showInformationMessage(`Template "${item.entry.name}" deleted.`);
}
