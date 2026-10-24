import { AnyObject } from '../../typeing/common';

export interface ResultTab {
    id: number;
    sql: string;
    success: boolean;
    error?: string;
    message?: string;
    columns: string[];
    rows: AnyObject[];
    tableName: string | null;
    editable: boolean;
}

export interface SourceResult {
    sql: string;
    success: boolean;
    data?: any;
    error?: string;
    tableName?: string | null;
}

/**
 * Convert one statement's raw execution result into the shape the results
 * grid webview renders: a uniform {columns, rows} table plus a status
 * message, regardless of whether the driver returned an array of rows (a
 * SELECT) or an info object (an INSERT/UPDATE/DELETE "OK" summary).
 *
 * @param {SourceResult} result
 * @param {number} id - stable id for this tab, used by the webview and by
 *                       edit/copy messages to address it
 * @return {ResultTab}
 */
export function toResultTab(result: SourceResult, id: number): ResultTab {
    if (!result.success) {
        return {
            id,
            sql: result.sql,
            success: false,
            error: result.error,
            message: result.error,
            columns: [],
            rows: [],
            tableName: null,
            editable: false
        };
    }

    const data = result.data;
    const tableName = result.tableName || null;

    if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.message !== 'undefined') {
        const summaryRow: AnyObject = {
            fieldCount: data.fieldCount,
            affectedRows: data.affectedRows,
            insertId: data.insertId,
            serverStatus: data.serverStatus,
            warningCount: data.warningCount,
            changedRows: data.changedRows
        };
        return {
            id,
            sql: result.sql,
            success: true,
            message: data.message,
            columns: Object.keys(summaryRow),
            rows: [summaryRow],
            tableName: null,
            editable: false
        };
    }

    if (Array.isArray(data)) {
        const columns = data.length > 0 ? Object.keys(data[0]) : [];
        return {
            id,
            sql: result.sql,
            success: true,
            message: `Query result ${data.length} row${data.length === 1 ? '' : 's'}!`,
            columns,
            rows: data,
            tableName,
            editable: Boolean(tableName) && data.length > 0
        };
    }

    return {
        id,
        sql: result.sql,
        success: true,
        message: 'OK',
        columns: [],
        rows: [],
        tableName: null,
        editable: false
    };
}
