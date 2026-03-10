const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);

function createSessionStore(pool) {
    return new MySQLStore({
        expiration: 86400000,
        createDatabaseTable: false,
        schema: {
            tableName: 'sessions',
            columnNames: {
                session_id: 'session_id',
                expires: 'expires',
                data: 'data'
            }
        }
    }, pool);
}

function getSessionConfig(store) {
    return {
        key: 'session_id',
        secret: process.env.SESSION_SECRET,
        store: store,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: 86400000,
            sameSite: 'lax'
        }
    };
}

module.exports = { createSessionStore, getSessionConfig };