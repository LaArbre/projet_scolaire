/*fichier par Elio*/
const { getPool } = require('../config/db');

async function insertLog(userId, name, info) {
    try {
        const db = getPool();
        const [[logType]] = await db.query(
            'SELECT id FROM logs WHERE name = ?',
            [name]
        );
        if (!logType) {
            console.error(`Type de log inconnu : "${name}"`);
            return;
        }
        await db.query(
            'INSERT INTO user_logs (idUser, idLog, info) VALUES (?, ?, ?)',
            [userId, logType.id, info]
        );
    } catch (err) {
        console.error('Erreur insertion log :', err.message);
    }
}

module.exports = { insertLog };
