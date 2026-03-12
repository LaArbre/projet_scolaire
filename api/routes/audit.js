const express   = require('express');
const { getPool }   = require('../config/db');
const auth          = require('../middlewares/auth');
const checkRole     = require('../middlewares/checkRole');
const { isPositiveInt } = require('../utils/validate');

const router = express.Router();
router.use(auth, checkRole(['legal', 'admin']));

router.get('/', async (req, res) => {
    try {
        const { userId, action, entityType, entityId } = req.query;
        const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const db = getPool();

        let query  = `SELECT al.*, u.email AS user_email
                      FROM audit_logs al
                      LEFT JOIN users u ON al.user_id = u.id
                      WHERE 1=1`;
        const params = [];

        if (userId && isPositiveInt(userId)) {
            query += ' AND al.user_id = ?'; params.push(parseInt(userId, 10));
        }
        if (action && typeof action === 'string') {
            query += ' AND al.action LIKE ?'; params.push(`%${action.substring(0, 50)}%`);
        }
        if (entityType && typeof entityType === 'string') {
            query += ' AND al.entity_type = ?'; params.push(entityType.substring(0, 50));
        }
        if (entityId && isPositiveInt(entityId)) {
            query += ' AND al.entity_id = ?'; params.push(parseInt(entityId, 10));
        }

        query += ' ORDER BY al.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const [logs] = await db.query(query, params);
        res.json(logs);
    } catch (err) {
        console.error('Erreur récupération logs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
