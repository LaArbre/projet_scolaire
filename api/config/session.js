const session    = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function createSessionStore(pool) {
    const options = {
        expiration:          SESSION_TTL_MS,
        createDatabaseTable: true,
        schema: {
            tableName:   'sessions',
            columnNames: {
                session_id: 'session_id',
                expires:    'expires',
                data:       'data',
            },
        },
    };
    return new MySQLStore(options, pool);
}

function getSessionConfig(store) {
    return {
        store,
        secret:            process.env.SESSION_SECRET,
        resave:            false,
        saveUninitialized: false,
        name:              'sid',
        cookie: {
            httpOnly: true,
            secure:   true,
            sameSite: 'strict',
            maxAge:   SESSION_TTL_MS,
        },
    };
}

module.exports = { createSessionStore, getSessionConfig };
