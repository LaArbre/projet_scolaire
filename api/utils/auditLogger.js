const { getPool } = require('../config/db');

async function logAction(req, action, entityType, entityId = null, oldData = null, newData = null) {
    try {
        const db = getPool();
        await db.query(
            `INSERT INTO audit_logs
             (user_id, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.session?.user?.id ?? null,
                action,
                entityType,
                entityId,
                oldData  ? JSON.stringify(oldData)  : null,
                newData  ? JSON.stringify(newData)   : null,
                req.ip,
                req.headers['user-agent'] ?? null,
            ]
        );
    } catch (err) {
        console.error('⚠️  Erreur journalisation audit :', err.message);
    }
}

module.exports = { logAction };
