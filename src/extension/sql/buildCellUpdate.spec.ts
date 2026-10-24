import { buildCellUpdate, getAffectedRows } from './buildCellUpdate';

const mysqlQuote = (n: string) => '`' + n.replace(/`/g, '``') + '`';
const qmark = () => '?';
const dollar = (i: number) => `$${i + 1}`;

describe('buildCellUpdate', () => {

    it('binds the new value and key values as parameters', () => {
        const built = buildCellUpdate({
            tableName: 'people', column: 'name', newValue: 'Robert',
            originalRow: { id: 2, name: 'Bob', age: 41 }, keyColumns: ['id'],
            quoteIdentifier: mysqlQuote, placeholder: qmark
        });
        expect(built.sql).toEqual('UPDATE `people` SET `name` = ? WHERE `id` = ?');
        expect(built.params).toEqual(['Robert', 2]);
    });

    it('uses numbered placeholders for engines that need them', () => {
        const built = buildCellUpdate({
            tableName: 'people', column: 'name', newValue: 'x',
            originalRow: { id: 1, tenant: 't' }, keyColumns: ['id', 'tenant'],
            quoteIdentifier: (n) => `"${n}"`, placeholder: dollar
        });
        expect(built.sql).toEqual('UPDATE "people" SET "name" = $1 WHERE "id" = $2 AND "tenant" = $3');
        expect(built.params).toEqual(['x', 1, 't']);
    });

    it('never puts hostile cell content into the SQL text', () => {
        const evil = '\\\' OR 1=1 -- ';
        const built = buildCellUpdate({
            tableName: 'people', column: 'name', newValue: evil,
            originalRow: { id: 1, name: evil }, keyColumns: [],
            quoteIdentifier: mysqlQuote, placeholder: qmark
        });
        expect(built.sql).not.toContain('OR 1=1');
        expect(built.sql).not.toContain('--');
        expect(built.params).toEqual([evil, 1, evil]);
    });

    it('matches NULL originals with IS NULL and binds nothing for them', () => {
        const built = buildCellUpdate({
            tableName: 't', column: 'a', newValue: 'v',
            originalRow: { id: 1, note: null }, keyColumns: [],
            quoteIdentifier: mysqlQuote, placeholder: qmark
        });
        expect(built.sql).toEqual('UPDATE `t` SET `a` = ? WHERE `id` = ? AND `note` IS NULL');
        expect(built.params).toEqual(['v', 1]);
    });

    it('escapes quote characters inside identifiers', () => {
        const built = buildCellUpdate({
            tableName: 'we`ird', column: 'c', newValue: 1,
            originalRow: { id: 1 }, keyColumns: ['id'],
            quoteIdentifier: mysqlQuote, placeholder: qmark
        });
        expect(built.sql.startsWith('UPDATE `we``ird` SET')).toEqual(true);
    });
});

describe('getAffectedRows', () => {
    it('reads mysql / sqlite style results', () => {
        expect(getAffectedRows({ affectedRows: 1 })).toEqual(1);
        expect(getAffectedRows({ affectedRows: 0 })).toEqual(0);
    });

    it('reads pg style rowCount on an array', () => {
        const rows: any = [];
        Object.defineProperty(rows, 'rowCount', { value: 1 });
        expect(getAffectedRows(rows)).toEqual(1);
    });

    it('reads mssql style rowsAffected on an array', () => {
        const rows: any = [];
        Object.defineProperty(rows, 'rowsAffected', { value: [3] });
        expect(getAffectedRows(rows)).toEqual(3);
    });

    it('returns null when the driver gives no count', () => {
        expect(getAffectedRows([])).toBeNull();
        expect(getAffectedRows(undefined)).toBeNull();
    });
});
