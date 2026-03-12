const express   = require('express');
const { getPool }   = require('../config/db');
const auth          = require('../middlewares/auth');
const { logAction } = require('../utils/auditLogger');
const { isPositiveInt } = require('../utils/validate');

const router = express.Router({ mergeParams: true });

// ── GET /api/reports/:reportId/messages ───────────────────────────────────────
router.get('/', auth, async (req, res) => {
    try {
        if (!isPositiveInt(req.params.reportId))
            return res.status(400).json({ error: 'ID invalide' });

        const reportId = parseInt(req.params.reportId, 10);
        const limit    = Math.min(parseInt(req.query.limit) || 20, 100);
        const before   = req.query.before ? parseInt(req.query.before, 10) : null;
        const after    = req.query.after  ? parseInt(req.query.after,  10) : null;
        const db       = getPool();

        // Vérifier accès au signalement
        const [reports] = await db.query('SELECT user_id FROM reports WHERE id = ?', [reportId]);
        if (reports.length === 0) return res.status(404).json({ error: 'Signalement non trouvé' });
        if (req.session.user.role === 'employee' && reports[0].user_id !== req.session.user.id)
            return res.status(403).json({ error: 'Accès interdit' });

        let query  = `SELECT id, sender_id, sender_role, content, is_anonymous, created_at
                      FROM messages WHERE report_id = ?`;
        const params = [reportId];
        let order    = 'DESC';

        if (before && !isNaN(before)) {
            query += ' AND id < ?'; params.push(before);
        } else if (after && !isNaN(after)) {
            query += ' AND id > ?'; params.push(after);
            order  = 'ASC';
        }

        query += ` ORDER BY id ${order} LIMIT ?`;
        params.push(limit);

        let [messages] = await db.query(query, params);
        if (order === 'ASC') messages = messages.reverse();

        // Pagination curseur
        let hasBefore = false, hasAfter = false;
        if (messages.length > 0) {
            const firstId = messages[0].id;
            const lastId  = messages[messages.length - 1].id;
            const [[b]]   = await db.query(
                'SELECT id FROM messages WHERE report_id = ? AND id < ? LIMIT 1', [reportId, lastId]);
            const [[a]]   = await db.query(
                'SELECT id FROM messages WHERE report_id = ? AND id > ? LIMIT 1', [reportId, firstId]);
            hasBefore = !!b;
            hasAfter  = !!a;
        }

        res.json({ messages, hasBefore, hasAfter, limit });
    } catch (err) {
        console.error('Erreur récupération messages:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── POST /api/reports/:reportId/messages ──────────────────────────────────────
router.post('/', auth, async (req, res) => {
    try {
        if (!isPositiveInt(req.params.reportId))
            return res.status(400).json({ error: 'ID invalide' });

        const reportId   = parseInt(req.params.reportId, 10);
        const { content, isAnonymous } = req.body;
        const db = getPool();

        if (!content || !content.trim() || content.length > 5000)
            return res.status(400).json({ error: 'Contenu invalide (1-5000 caractères)' });

        // Vérifier accès au signalement
        const [reports] = await db.query('SELECT user_id FROM reports WHERE id = ?', [reportId]);
        if (reports.length === 0) return res.status(404).json({ error: 'Signalement non trouvé' });
        if (req.session.user.role === 'employee' && reports[0].user_id !== req.session.user.id)
            return res.status(403).json({ error: 'Accès interdit' });

        const [result] = await db.query(
            `INSERT INTO messages (report_id, sender_id, sender_role, content, is_anonymous)
             VALUES (?, ?, ?, ?, ?)`,
            [reportId, req.session.user.id, req.session.user.role, content.trim(), !!isAnonymous]
        );

        const [newMsg] = await db.query(
            `SELECT id, sender_id, sender_role, content, is_anonymous, created_at
             FROM messages WHERE id = ?`,
            [result.insertId]
        );

        await logAction(req, 'SEND_MESSAGE', 'message', result.insertId);
        res.json({ success: true, message: newMsg[0] });
    } catch (err) {
        console.error('Erreur envoi message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
