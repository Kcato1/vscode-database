import { AnyObject } from '../../typeing/common';

export interface CellUpdateInput {
    tableName: string;
    column: string;
    newValue: any;
    originalRow: AnyObject;
    /** Primary key columns when known; otherwise every column of the original row is matched. */
    keyColumns: string[];
    quoteIdentifier: (name: string) => string;
    placeholder: (index: number) => string;
}

export interface BuiltStatement {
    sql: string;
    params: any[];
}

/**
 * Build a fully parameterised `UPDATE` for one edited grid cell. Values are
 * never interpolated into the SQL text, so cell contents (including quotes,
 * backslashes and comment markers) cannot change the statement's structure.
 * `NULL` originals are matched with `IS NULL`, since `= NULL` never matches.
 */
export function buildCellUpdate(input: CellUpdateInput): BuiltStatement {
    const { tableName, column, newValue, originalRow, keyColumns, quoteIdentifier, placeholder } = input;
    const params: any[] = [];
    const bind = (value: any) => {
        params.push(value);
        return placeholder(params.length - 1);
    };

    const setClause = `${quoteIdentifier(column)} = ${bind(newValue)}`;
    const whereColumns = keyColumns.length > 0 ? keyColumns : Object.keys(originalRow);
    const whereClause = whereColumns
        .map((col) => {
            const value = originalRow[col];
            if (value === null || typeof value === 'undefined') {
                return `${quoteIdentifier(col)} IS NULL`;
            }
            return `${quoteIdentifier(col)} = ${bind(value)}`;
        })
        .join(' AND ');

    return {
        sql: `UPDATE ${quoteIdentifier(tableName)} SET ${setClause} WHERE ${whereClause}`,
        params
    };
}

/**
 * Normalises "how many rows did that statement change" across drivers:
 * mysql/sqlite return `affectedRows`, pg attaches `rowCount` to the rows
 * array, mssql attaches `rowsAffected`. Returns null when it cannot tell.
 */
export function getAffectedRows(result: any): number | null {
    if (result && typeof result.affectedRows === 'number') {
        return result.affectedRows;
    }
    if (Array.isArray(result)) {
        const withCount = result as any;
        if (typeof withCount.rowCount === 'number') {
            return withCount.rowCount;
        }
        if (Array.isArray(withCount.rowsAffected) && typeof withCount.rowsAffected[0] === 'number') {
            return withCount.rowsAffected[0];
        }
    }
    return null;
}
