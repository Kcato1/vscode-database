import { MySQLType } from './mysql-pass';

/**
 * MariaDB speaks the same wire protocol as MySQL (the `mysql` npm driver
 * connects to both transparently), so this is a thin subclass that only
 * changes the displayed type name and default port/username hints shown
 * in the connection form. All query/structure/edit logic is inherited.
 */
export class MariaDBType extends MySQLType {
    constructor() {
        super();
        this.type = 'mariadb';
    }
}

MariaDBType.prototype.typeName = 'MariaDB';

MariaDBType.prototype.fieldsToConnect = [
    {
        type: 'text',
        defaultValue: 'localhost',
        name: 'host',
        title: 'Host',
        info: '(e.g host, 127.0.0.1, with port 127.0.0.1:3306)'
    },
    {
        type: 'checkbox',
        defaultValue: false,
        name: 'socket',
        title: 'via socket',
        info: '(if you want to connect via socket, enter socketPath in the host field)'
    },
    {
        type: 'checkbox',
        defaultValue: false,
        name: 'insecureAuth',
        title: 'insecure auth',
        info: '(Allow connecting to MariaDB/MySQL instances that ask for the old (insecure) authentication method)'
    },
    {
        type: 'text',
        defaultValue: 'root',
        name: 'username',
        title: 'Username',
        info: '(e.g root/user)'
    },
    {
        type: 'password',
        name: 'password',
        defaultValue: '',
        title: 'Password',
        info: ''
    }
];

export default MariaDBType;
