import { extractTableName } from './extractTableName';

describe('extractTableName', () => {
    it('extracts a simple table name', () => {
        expect(extractTableName('SELECT * FROM users')).toEqual('users');
    });

    it('extracts with WHERE clause', () => {
        expect(extractTableName('SELECT id, name FROM users WHERE id = 1')).toEqual('users');
    });

    it('extracts with quoted identifiers', () => {
        expect(extractTableName('SELECT * FROM `users` LIMIT 10')).toEqual('users');
        expect(extractTableName('SELECT * FROM "users" ORDER BY id')).toEqual('users');
    });

    it('strips schema prefix', () => {
        expect(extractTableName('SELECT * FROM public.users')).toEqual('users');
    });

    it('returns null for joins', () => {
        expect(extractTableName('SELECT * FROM users JOIN orders ON users.id = orders.user_id')).toBeNull();
    });

    it('returns null for comma-joined tables', () => {
        expect(extractTableName('SELECT * FROM users, orders WHERE users.id = orders.user_id')).toBeNull();
    });

    it('returns null for non-SELECT statements', () => {
        expect(extractTableName('UPDATE users SET name = \'a\'')).toBeNull();
        expect(extractTableName('INSERT INTO users VALUES (1)')).toBeNull();
    });

    it('returns null when there is no FROM clause', () => {
        expect(extractTableName('SELECT 1')).toBeNull();
    });
});
