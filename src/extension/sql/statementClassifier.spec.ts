import { classifyStatement, isWriteStatement, findWriteStatements } from './statementClassifier';

describe('statementClassifier', () => {

    it('classifies SELECT as read', () => {
        expect(classifyStatement('SELECT * FROM table1')).toEqual('read');
        expect(classifyStatement('  \n select 1')).toEqual('read');
    });

    it('classifies SHOW/EXPLAIN/DESCRIBE/PRAGMA as read', () => {
        expect(classifyStatement('SHOW TABLES')).toEqual('read');
        expect(classifyStatement('EXPLAIN SELECT 1')).toEqual('read');
        expect(classifyStatement('EXPLAIN (FORMAT JSON) SELECT 1')).toEqual('read');
        expect(classifyStatement('DESCRIBE table1')).toEqual('read');
        expect(classifyStatement('PRAGMA table_info(table1)')).toEqual('read');
    });

    it('classifies EXPLAIN ANALYZE over a write as a write (PG executes the inner statement)', () => {
        expect(classifyStatement('EXPLAIN ANALYZE DELETE FROM t')).toEqual('write');
        expect(classifyStatement('EXPLAIN ANALYZE UPDATE t SET a = 1')).toEqual('write');
        expect(classifyStatement('EXPLAIN (ANALYZE) INSERT INTO t VALUES (1)')).toEqual('write');
        expect(classifyStatement('EXPLAIN ANALYSE DELETE FROM t')).toEqual('write');
        // EXPLAIN ANALYZE SELECT is still read-only
        expect(classifyStatement('EXPLAIN ANALYZE SELECT * FROM t')).toEqual('read');
        // EXPLAIN without ANALYZE is always read-only
        expect(classifyStatement('EXPLAIN DELETE FROM t')).toEqual('read');
    });

    it('classifies INSERT/UPDATE/DELETE as write', () => {
        expect(classifyStatement('INSERT INTO table1 VALUES (1)')).toEqual('write');
        expect(classifyStatement('UPDATE table1 SET a = 1')).toEqual('write');
        expect(classifyStatement('DELETE FROM table1')).toEqual('write');
    });

    it('classifies CREATE/DROP/ALTER/TRUNCATE as ddl', () => {
        expect(classifyStatement('CREATE TABLE table1 (a int)')).toEqual('ddl');
        expect(classifyStatement('DROP TABLE table1')).toEqual('ddl');
        expect(classifyStatement('ALTER TABLE table1 ADD b int')).toEqual('ddl');
        expect(classifyStatement('TRUNCATE TABLE table1')).toEqual('ddl');
    });

    it('classifies BEGIN/COMMIT/ROLLBACK as transaction', () => {
        expect(classifyStatement('BEGIN')).toEqual('transaction');
        expect(classifyStatement('COMMIT')).toEqual('transaction');
        expect(classifyStatement('ROLLBACK')).toEqual('transaction');
    });

    it('classifies USE as read (switching database changes no data)', () => {
        expect(classifyStatement('USE testdb')).toEqual('read');
        expect(isWriteStatement('USE testdb')).toEqual(false);
    });

    it('treats session SET as non-write but SET GLOBAL as write', () => {
        expect(isWriteStatement('SET search_path TO public')).toEqual(false);
        expect(isWriteStatement('SET autocommit = 0')).toEqual(false);
        expect(isWriteStatement('SET GLOBAL read_only = 0')).toEqual(true);
        expect(isWriteStatement('set persist max_connections = 10')).toEqual(true);
    });

    it('treats SELECT ... INTO <table|file> as a write but INTO @var as read', () => {
        expect(isWriteStatement('SELECT * INTO backup_people FROM people')).toEqual(true);
        expect(isWriteStatement('SELECT * FROM people INTO OUTFILE \'/tmp/x\'')).toEqual(true);
        expect(isWriteStatement('SELECT COUNT(*) INTO @n FROM people')).toEqual(false);
    });

    it('classifies a read-only CTE as read', () => {
        expect(classifyStatement('WITH t AS (SELECT * FROM table1) SELECT * FROM t')).toEqual('read');
    });

    it('classifies a writable CTE as write', () => {
        expect(classifyStatement('WITH t AS (SELECT 1) INSERT INTO table1 SELECT * FROM t')).toEqual('write');
    });

    it('treats an empty statement as unknown', () => {
        expect(classifyStatement('   ')).toEqual('unknown');
    });

    it('treats an unrecognized leading keyword as unknown (fail closed)', () => {
        expect(classifyStatement('WOMBAT something')).toEqual('unknown');
    });

    it('isWriteStatement treats unknown as a write (fail closed)', () => {
        expect(isWriteStatement('WOMBAT something')).toEqual(true);
        expect(isWriteStatement('SELECT 1')).toEqual(false);
        expect(isWriteStatement('DROP TABLE t')).toEqual(true);
    });

    it('findWriteStatements filters only the writes', () => {
        const statements = ['SELECT 1', 'INSERT INTO t VALUES (1)', 'SHOW TABLES', 'DROP TABLE t'];
        expect(findWriteStatements(statements)).toEqual(['INSERT INTO t VALUES (1)', 'DROP TABLE t']);
    });
});
