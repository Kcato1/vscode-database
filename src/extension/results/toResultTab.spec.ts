import { toResultTab } from './toResultTab';

describe('toResultTab', () => {

    it('maps a failed statement to a non-editable error tab', () => {
        const tab = toResultTab({ sql: 'SELECT 1', success: false, error: 'boom' }, 1);
        expect(tab).toMatchObject({
            id: 1, success: false, error: 'boom', message: 'boom', columns: [], rows: [], editable: false
        });
    });

    it('maps an array of rows to a row/column table, editable when a table name is known', () => {
        const rows = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
        const tab = toResultTab({ sql: 'SELECT * FROM users', success: true, data: rows, tableName: 'users' }, 2);
        expect(tab.columns).toEqual(['id', 'name']);
        expect(tab.rows).toBe(rows);
        expect(tab.editable).toEqual(true);
        expect(tab.message).toEqual('Query result 2 rows!');
    });

    it('is not editable without a known table name', () => {
        const rows = [{ id: 1 }];
        const tab = toResultTab({ sql: 'SELECT * FROM a JOIN b', success: true, data: rows, tableName: null }, 3);
        expect(tab.editable).toEqual(false);
    });

    it('is not editable for an empty result set', () => {
        const tab = toResultTab({ sql: 'SELECT * FROM users WHERE 0=1', success: true, data: [], tableName: 'users' }, 4);
        expect(tab.editable).toEqual(false);
        expect(tab.message).toEqual('Query result 0 rows!');
    });

    it('maps a write-result info object to a single summary row, never editable', () => {
        const data = { message: 'OK', affectedRows: 1, insertId: 5, fieldCount: 0, serverStatus: 2, warningCount: 0, changedRows: 0 };
        const tab = toResultTab({ sql: 'INSERT INTO users VALUES (1)', success: true, data }, 5);
        expect(tab.rows).toEqual([{ affectedRows: 1, insertId: 5, fieldCount: 0, serverStatus: 2, warningCount: 0, changedRows: 0 }]);
        expect(tab.editable).toEqual(false);
        expect(tab.message).toEqual('OK');
    });

    it('maps a plain OK result (no rows, no message) to an empty non-editable tab', () => {
        const tab = toResultTab({ sql: 'BEGIN', success: true, data: undefined }, 6);
        expect(tab.message).toEqual('OK');
        expect(tab.rows).toEqual([]);
        expect(tab.editable).toEqual(false);
    });
});
