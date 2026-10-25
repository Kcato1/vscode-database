/**
 * Minimal hand-written types for the small slice of the `mssql` API this
 * extension actually uses. The upstream package ships no types of its own,
 * and `@types/mssql` transitively pulls in `tedious`'s auto-generated
 * declaration files, which use TypeScript syntax (inline `type` import/
 * export modifiers, `unique symbol` computed properties, DOM/ES2022 lib
 * types) that this project's older build target does not need and is not
 * configured to parse. This shim covers exactly what `mssql.ts` calls.
 */
declare module 'mssql' {
    export interface IOptions {
        encrypt?: boolean;
        trustServerCertificate?: boolean;
    }

    export interface IConfig {
        server: string;
        port?: number;
        user: string;
        password: string;
        database?: string;
        options?: IOptions;
    }

    export type IRecordSet<T = any> = Array<T>;

    export interface IResult<T = any> {
        recordset: IRecordSet<T>;
        rowsAffected: number[];
    }

    export class Request {
        input(name: string, type: any, value?: any): Request;
        input(name: string, value: any): Request;
        query<T = any>(command: string): Promise<IResult<T>>;
    }

    export class ConnectionPool {
        constructor(config: IConfig);
        connect(): Promise<ConnectionPool>;
        close(): Promise<void>;
        request(): Request;
    }

    export const NVarChar: any;
    export const Int: any;
    export const VarChar: any;
}
