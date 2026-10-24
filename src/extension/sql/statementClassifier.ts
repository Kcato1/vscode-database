/**
 * Pure helpers to classify a single SQL statement as read-only or a
 * write/DDL/transaction-control statement. Used to enforce read-only
 * connections and to decide how to treat statements in a multi-query batch.
 *
 * Deliberately conservative: anything it cannot positively identify as
 * read-only is treated as a write, so read-only enforcement fails closed.
 */

export type StatementKind = 'read' | 'write' | 'ddl' | 'transaction' | 'unknown';

const READ_ONLY_KEYWORDS = [
    'select', 'show', 'explain', 'describe', 'desc', 'pragma', 'help', 'values', 'use'
];

const DDL_KEYWORDS = [
    'create', 'drop', 'alter', 'truncate', 'rename', 'comment'
];

const WRITE_KEYWORDS = [
    'insert', 'update', 'delete', 'replace', 'merge', 'grant', 'revoke',
    'call', 'execute', 'exec', 'load', 'copy', 'vacuum', 'analyze', 'reindex'
];

const TRANSACTION_KEYWORDS = [
    'begin', 'start', 'commit', 'rollback', 'savepoint', 'release', 'set'
];

/**
 * @param {string} sql - a single SQL statement (no leading comments expected,
 *                        but leading whitespace/parentheses are tolerated)
 * @return {string} the first significant SQL keyword, lower-cased
 */
export function getLeadingKeyword(sql: string): string {
    const withoutLeadingNoise = sql.replace(/^[\s(]+/, '');
    // WITH ... SELECT (a CTE) - look past the WITH clause to the final
    // statement keyword is hard in general; treat `with` itself as read-only
    // only when it is not followed eventually by a write keyword at depth 0.
    const match = withoutLeadingNoise.match(/^([A-Za-z]+)/);
    return match ? match[1].toLowerCase() : '';
}

/**
 * @param {string} sql - a single SQL statement
 * @return {StatementKind}
 */
export function classifyStatement(sql: string): StatementKind {
    const trimmed = sql.trim();
    if (!trimmed) {
        return 'unknown';
    }

    const keyword = getLeadingKeyword(trimmed);

    if (keyword === 'with') {
        // A CTE: conservatively scan for a write keyword anywhere before the
        // first top-level SELECT; if one is found, treat the whole statement
        // as a write (covers `WITH x AS (...) INSERT INTO ... SELECT ...`
        // and similar writable CTEs).
        const body = trimmed.toLowerCase();
        for (const writeWord of [...WRITE_KEYWORDS, ...DDL_KEYWORDS]) {
            const re = new RegExp('(^|[\\s(;])' + writeWord + '([\\s(]|$)');
            if (re.test(body)) {
                return writeWord === 'call' || writeWord === 'execute' || writeWord === 'exec'
                    ? 'write'
                    : (DDL_KEYWORDS.indexOf(writeWord) !== -1 ? 'ddl' : 'write');
            }
        }
        return 'read';
    }

    if (READ_ONLY_KEYWORDS.indexOf(keyword) !== -1) {
        // `SELECT ... INTO <table|OUTFILE|DUMPFILE>` creates a table or writes a
        // file. (`INTO @variable` only assigns a session variable, so it stays read.)
        if (keyword === 'select' && /\binto\s+(?!@)[\w"`[#]/i.test(trimmed)) {
            return 'write';
        }
        return 'read';
    }
    if (DDL_KEYWORDS.indexOf(keyword) !== -1) {
        return 'ddl';
    }
    if (WRITE_KEYWORDS.indexOf(keyword) !== -1) {
        return 'write';
    }
    if (keyword === 'set' && /^\s*set\s+(global|persist|persist_only)\b/i.test(trimmed)) {
        // Changes server-wide configuration, not just this session.
        return 'write';
    }
    if (TRANSACTION_KEYWORDS.indexOf(keyword) !== -1) {
        return 'transaction';
    }
    return 'unknown';
}

/**
 * @param {string} sql - a single SQL statement
 * @return {boolean} true if this statement would modify data or schema.
 *                    Unknown statements are treated as writes (fail closed).
 */
export function isWriteStatement(sql: string): boolean {
    const kind = classifyStatement(sql);
    return kind === 'write' || kind === 'ddl' || kind === 'unknown';
}

/**
 * @param {string[]} statements - statements already split by AbstractServer#splitQueries
 * @return {string[]} the statements that would modify data or schema
 */
export function findWriteStatements(statements: string[]): string[] {
    return statements.filter(isWriteStatement);
}
