const express = require('express');
const { getPool } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const router = express.Router();

router.use(auth, checkRole(['legal', 'admin']));

router.get('/', async (req, res) => {
    try {
        const { userId, action, entityType, entityId, limit = 50 } = req.query;
        const db = getPool();

        let query = `
            SELECT al.*, u.email as user_email
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            WHERE 1=1
        `;
        const params = [];

        if (userId) {
            query += ` AND al.user_id = ?`;
            params.push(userId);
        }
        if (action) {
            query += ` AND al.action LIKE ?`;
            params.push(`%${action}%`);
        }
        if (entityType) {
            query += ` AND al.entity_type = ?`;
            params.push(entityType);
        }
        if (entityId) {
            query += ` AND al.entity_id = ?`;
            params.push(entityId);
        }

        query += ` ORDER BY al.created_at DESC LIMIT ?`;
        params.push(parseInt(limit));

        const [logs] = await db.query(query, params);
        res.json(logs);
    } catch (err) {
        console.error('Erreur récupération logs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;