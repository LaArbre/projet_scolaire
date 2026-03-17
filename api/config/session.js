const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config();

function createSessionStore(pool) {
    const options = {
        expiration: 86400000,
        createDatabaseTable: true,
        schema: {
            tableName: 'sessions',
            columnNames: {
                session_id: 'session_id',
                expires: 'expires',
                data: 'data'
            }
        }
    };
    return new MySQLStore(options, pool);
}

function getSessionConfig(store) {
    return {
        store: store,
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        name: 'sid',
        cookie: {
            httpOnly: true,
            secure: true,
            sameSite: 'none',
            maxAge: 24 * 60 * 60 * 1000
        }
    };
}

module.exports = { createSessionStore, getSessionConfig };