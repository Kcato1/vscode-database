import { AbstractAction } from './AbstractAction';
import { showWebview } from '../webViews/webViewsRunner';
import {allServerType, ServerTypeName} from '../factoryServer';
import { AnyObject } from '../../typeing/common';
import { factoryServer } from '../factoryServer';

const READ_ONLY_FIELD = {
    type: 'checkbox',
    defaultValue: false,
    name: 'readOnly',
    title: 'Open as read-only',
    info: '(blocks INSERT/UPDATE/DELETE/DDL statements from this extension)'
};

interface DataForm {
    type: string;
    name?: string;
    fields: any[];
}

export class ConnectToSQLServer extends AbstractAction{

    private dataFormCache: null | DataForm[] = null;

    async getDataForm() {
        if (this.dataFormCache !== null) {
            return this.dataFormCache;
        }
        // TODO move fieldsToConnect to other file without lazy loading
        const loadAllType = Object.keys(allServerType).map(async (key) => {

            const serverModule = await allServerType[key]();
            return {
                type: key,
                name: serverModule.default.prototype.typeName,
                fields: [...serverModule.default.prototype.fieldsToConnect, READ_ONLY_FIELD]
            };
        });

        const dataForm = await Promise.all(loadAllType);
        this.dataFormCache = dataForm;
        return dataForm;
    }

    execution(){
        showWebview('connect', 'Connect to SQL server').then((panel) => {
            this.getDataForm().then((dataForm) => {
                panel.webview.postMessage({ 
                    type: 'SHOW_FORM', 
                    payload : dataForm
                });
            });

            panel.webview.onDidReceiveMessage((action) => {
                if (action.type === 'TEST_CONNECTION') {
                    this.testConnection(action.payload.type, action.payload.fieldValue)
                        .then((result) => panel.webview.postMessage({ type: 'TEST_CONNECTION_RESULT', payload: result }));
                    return;
                }
                if (action.type === 'CONNECT_TO_SQL_SERVER') {
                    this.connectFactory(action.payload.type, action.payload.fieldValue)
                        .then(() => {
                            panel.dispose();
                        })
                        .catch((error) => {
                            panel.webview.postMessage({ 
                                type: 'CONNECTION_ERROR', 
                                payload : { error } 
                            });
                        });
                }
            });
        });
    }
	
    /**
     * Connects with the given fields, measures how long it took, then closes
     * the connection again without registering it with the manager.
     */
    async testConnection(type: ServerTypeName, fields: AnyObject): Promise<{ok: boolean; message: string}> {
        const start = Date.now();
        try {
            const server = await factoryServer(type);
            await server.connectPromise(fields);
            const connectMs = Date.now() - start;
            const queryStart = Date.now();
            let queryInfo = '';
            try {
                await server.queryPromise('SELECT 1');
                queryInfo = `, test query ${Date.now() - queryStart} ms`;
            } catch (e) {
                queryInfo = ' (connected, but test query failed)';
            }
            await server.closeConnect();
            return { ok: true, message: `Connection OK: connected in ${connectMs} ms${queryInfo}.` };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, message: `Connection failed after ${Date.now() - start} ms: ${message}` };
        }
    }

    connectFactory(type: ServerTypeName, fields: AnyObject){
        if (allServerType[type]) {
            return this.sqlMenager.connectPromise(type, fields);
        }

        return Promise.reject(`Unknow type ${type}`);
    }
	

}
