import { AbstractAction } from './AbstractAction';
import { Manager } from '../Manager';
import { ChangeDB } from './extension.changeDB';
import { ChangeServer } from './extension.changeServer';
import { SaveConfig } from './extension.saveConfig';
import { RunQueryBuild } from './extension.runQueryBuild';
import { QuerySelectedSQL } from './extension.querySelectedSQL';
import { QuerySelectedSQLToCSV } from './extension.querySelectedSQLToCSV';
import { QueryFileSQLToCSV } from './extension.queryFileSQLToCSV';
import { QueryFileSQL } from './extension.queryFileSQL';
import { QueryBuild } from './extension.queryBuild';
import { ConnectToSQLServer } from './extension.connectToSQLServer';
import { QuerySQL } from './extension.querySQL';
import { ShowQueryHistory } from './extension.showQueryHistory';
import { ToggleReadOnly } from './extension.toggleReadOnly';
import { StopQueries } from './extension.stopQueries';
import { FormatSQL } from './extension.formatSQL';
import { TestConnection } from './extension.testConnection';

export interface ActionsList {
    [K: string]: typeof AbstractAction;
}

export const actionsList: ActionsList = {
    'extension.changeDB': ChangeDB,
    'extension.changeServer': ChangeServer,
    'extension.connectToSQLServer': ConnectToSQLServer,
    'extension.queryBuild': QueryBuild,
    'extension.queryFileSQL': QueryFileSQL,
    'extension.queryFileSQLToCSV': QueryFileSQLToCSV,
    'extension.querySelectedSQL': QuerySelectedSQL,
    'extension.querySelectedSQLToCSV': QuerySelectedSQLToCSV,
    'extension.querySQL': QuerySQL,
    'extension.runQueryBuild': RunQueryBuild,
    'extension.saveConfig': SaveConfig,
    'extension.showQueryHistory': ShowQueryHistory,
    'extension.toggleReadOnly': ToggleReadOnly,
    'extension.stopQueries': StopQueries,
    'extension.formatSQL': FormatSQL,
    'extension.testConnection': TestConnection,
};
