const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

async function initDB() {
    pool = await mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
    });
    return pool;
}

function getPool() {
    if (!pool) throw new Error('Pool non initialisé');
    return pool;
}

module.exports = { initDB, getPool };