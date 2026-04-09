const session    = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
require('dotenv').config();

// Durée de session centralisée — modifier ici pour impacter cookie ET store
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 heures

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
        secret:           process.env.SESSION_SECRET,
        resave:           false,
        saveUninitialized: false,
        name:             'sid',
        cookie: {
            httpOnly: true,
            secure:   true,        // HTTPS obligatoire (Nginx)
            sameSite: 'strict',    // Même domaine — 'none' n'est plus nécessaire
            maxAge:   SESSION_TTL_MS,
        },
    };
}

module.exports = { createSessionStore, getSessionConfig };
