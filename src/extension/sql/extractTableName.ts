/**
 * Best-effort extraction of the single source table name from a simple
 * `SELECT ... FROM table [WHERE|ORDER|GROUP|LIMIT ...]` statement. Used to
 * decide whether a result grid can offer inline cell editing (only safe
 * when we know unambiguously which table a row came from).
 *
 * Deliberately conservative: joins, subqueries and multi-table FROM clauses
 * return null rather than guessing wrong.
 *
 * @param {string} sql - a single SQL statement
 * @return {string|null} the bare table name (schema prefix stripped), or null
 */
export function extractTableName(sql: string): string | null {
    const trimmed = sql.trim();

    if (!/^select\b/i.test(trimmed)) {
        return null;
    }
    if (/\bjoin\b/i.test(trimmed)) {
        return null;
    }

    const match = trimmed.match(/\bfrom\s+["'`[]?([\w]+(?:\.[\w]+)?)["'`\]]?\s*(where|order\s+by|group\s+by|limit|having|;|$)/i);
    if (!match) {
        return null;
    }

    // Reject a comma-separated FROM list (old-style implicit join) by
    // checking no comma appears before the matched keyword/end.
    const fromIndex = trimmed.toLowerCase().indexOf('from');
    const afterFrom = trimmed.slice(fromIndex + 4, fromIndex + 4 + match[0].length);
    if (afterFrom.includes(',')) {
        return null;
    }

    const parts = match[1].split('.');
    return parts[parts.length - 1];
}
