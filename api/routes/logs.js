const express    = require('express');
const { getPool }    = require('../config/db');
const auth           = require('../middlewares/auth');
const checkRole      = require('../middlewares/checkRole');

const router = express.Router();

router.get('/', auth, checkRole(['admin', 'legal']), async (req, res) => {
    try {
        const db     = getPool();
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
        const offset = Math.max(parseInt(req.query.offset) || 0,  0);

        const filters = [];
        const params  = [];

        if (req.query.name && typeof req.query.name === 'string') {
            filters.push('l.name = ?');
            params.push(req.query.name);
        }

        const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM user_logs ul
             JOIN logs l ON ul.idLog = l.id
             ${where}`,
            params
        );

        const [logs] = await db.query(
            `SELECT ul.id, ul.date, ul.idUser, ul.info,
                    u.fullname, u.email,
                    l.id AS logId, l.name
             FROM user_logs ul
             JOIN logs l ON ul.idLog = l.id
             JOIN users u ON ul.idUser = u.id
             ${where}
             ORDER BY ul.date DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        res.json({ logs, total, limit, offset });
    } catch (err) {
        console.error('Erreur récupération logs :', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
