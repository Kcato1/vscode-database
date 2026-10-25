import * as mssql from 'mssql';
import { AbstractServer } from './AbstractServer';
import { AnyObject } from '../../typeing/common';

const SELECT_DATABASE_SQL = 'SELECT name AS [Database] FROM sys.databases ORDER BY name';

const SELECT_TABLE_SQL = `
SELECT TABLE_NAME AS tableName
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME
`;

const SELECT_COLUMNS_SQL = `
SELECT
  c.COLUMN_NAME AS [Field],
  c.DATA_TYPE AS [Type],
  c.IS_NULLABLE AS [Null],
  CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 'PRI' ELSE '' END AS [Key],
  c.COLUMN_DEFAULT AS [Default],
  '' AS [Extra]
FROM INFORMATION_SCHEMA.COLUMNS c
LEFT JOIN (
  SELECT ku.TABLE_NAME, ku.COLUMN_NAME
  FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
  INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
    ON tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
WHERE c.TABLE_NAME = @tableName
ORDER BY c.ORDINAL_POSITION
`;

/**
 * Microsoft SQL Server support via the `mssql` package (built on `tedious`).
 */
export class MSSQLType extends AbstractServer {

    protected pool?: mssql.ConnectionPool;
    public database: string;
    public encrypt: boolean;

    constructor() {
        super();
        this.type = 'mssql';
        this.host = 'Empty';
        this.port = '1433';
        this.username = 'Empty';
        this.password = 'Empty';
        this.database = '';
        this.encrypt = false;
    }

    connectPromise({ host, username, password, database, encrypt }: AnyObject): Promise<undefined> {
        const [hostName, port = '1433'] = host.split(':');
        this.host = hostName;
        this.port = port;
        this.username = username;
        this.password = password;
        this.database = database;
        this.encrypt = Boolean(encrypt);

        const pool = new mssql.ConnectionPool({
            server: hostName,
            port: parseInt(port, 10),
            user: username,
            password: password,
            database: database,
            options: {
                encrypt: this.encrypt,
                trustServerCertificate: true
            }
        });

        return pool.connect().then(() => {
            this.pool = pool;
            this.currentDatabase = this.database || null;
            return undefined;
        }).catch((err: Error) => {
            return Promise.reject(err.message);
        });
    }

    queryPromise(sql: string, params?: any[]): Promise<AnyObject[]> {
        if (!this.pool) {
            return Promise.reject(new Error('mssql: no open connection'));
        }
        const request = this.pool.request();
        (params || []).forEach((value, index) => request.input(`p${index}`, value));
        return request.query(sql).then((result) => {
            const rows = result.recordset || [];
            Object.defineProperty(rows, 'rowsAffected', { value: result.rowsAffected, enumerable: false });
            return rows;
        });
    }

    getParamPlaceholder(index: number): string {
        return `@p${index}`;
    }

    closeConnect(): Promise<void> {
        if (!this.pool) {
            return Promise.resolve();
        }
        return this.pool.close().then(() => {
            this.pool = undefined;
        });
    }

    getDatabase(): Promise<string[]> {
        return this.queryPromise(SELECT_DATABASE_SQL).then((rows) => rows.map((row) => row.Database as string));
    }

    changeDatabase(name: string): Promise<{}> {
        return this.closeConnect().then(() => this.connectPromise({
            host: this.host + ':' + this.port,
            username: this.username,
            password: this.password,
            database: name,
            encrypt: this.encrypt
        })).then(() => {
            this.currentDatabase = name;
            return {};
        });
    }

    getIdentifiedTableName(tableName: string): string {
        return `[${tableName.replace(/]/g, ']]')}]`;
    }

    getSelectTableSql(tableName: string, limit = 50): string {
        return `SELECT TOP ${limit} * FROM ${this.getIdentifiedTableName(tableName)}`;
    }

    refrestStructureDataBase(): Promise<{}> {
        if (!this.pool) {
            return Promise.resolve({});
        }
        const pool = this.pool;
        return this.queryPromise(SELECT_TABLE_SQL).then((tables) => {
            const structure: AnyObject = {};
            const columnPromises = tables.map((row) => {
                const tableName = row.tableName as string;
                return pool.request()
                    .input('tableName', mssql.NVarChar, tableName)
                    .query(SELECT_COLUMNS_SQL)
                    .then((result) => {
                        structure[tableName] = result.recordset;
                    });
            });
            return Promise.all(columnPromises).then(() => structure);
        });
    }
}

MSSQLType.prototype.typeName = 'Microsoft SQL Server';

MSSQLType.prototype.fieldsToConnect = [
    {
        type: 'text',
        defaultValue: 'localhost',
        name: 'host',
        title: 'Host',
        info: '(e.g host, 127.0.0.1, with port 127.0.0.1:1433)'
    },
    {
        type: 'text',
        defaultValue: 'master',
        name: 'database',
        title: 'Database',
        info: ''
    },
    {
        type: 'text',
        defaultValue: 'sa',
        name: 'username',
        title: 'Username',
        info: ''
    },
    {
        type: 'password',
        name: 'password',
        defaultValue: '',
        title: 'Password',
        info: ''
    },
    {
        type: 'checkbox',
        name: 'encrypt',
        defaultValue: false,
        title: 'Encrypt connection',
        info: '(required by Azure SQL Database)'
    }
];

export default MSSQLType;
