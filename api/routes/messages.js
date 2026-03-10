const express = require('express');
const { getPool } = require('../config/db');
const auth = require('../middlewares/auth');
const { logAction } = require('../utils/auditLogger');
const router = express.Router({ mergeParams: true });

router.get('/', auth, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { before, after, limit = 20 } = req.query;
        const db = getPool();

        const [reports] = await db.query(`SELECT user_id FROM reports WHERE id = ?`, [reportId]);
        if (reports.length === 0) return res.status(404).json({ error: 'Signalement non trouvé' });
        if (req.session.user.role === 'employee' && reports[0].user_id !== req.session.user.id) {
            return res.status(403).json({ error: 'Accès interdit' });
        }

        let query = `SELECT id, sender_id, sender_role, content, is_anonymous, created_at FROM messages WHERE report_id = ?`;
        const params = [reportId];
        let order = 'DESC';

        if (before) {
            query += ` AND id < ?`;
            params.push(before);
        } else if (after) {
            query += ` AND id > ?`;
            params.push(after);
            order = 'ASC';
        }

        query += ` ORDER BY id ${order} LIMIT ?`;
        params.push(parseInt(limit));

        const [messages] = await db.query(query, params);

        if (after) messages.reverse();

        let hasBefore = false, hasAfter = false;
        if (messages.length > 0) {
            const firstId = messages[0].id;
            const lastId = messages[messages.length - 1].id;

            const [beforeCheck] = await db.query(`SELECT id FROM messages WHERE report_id = ? AND id < ? LIMIT 1`, [reportId, lastId]);
            hasBefore = beforeCheck.length > 0;

            const [afterCheck] = await db.query(`SELECT id FROM messages WHERE report_id = ? AND id > ? LIMIT 1`, [reportId, firstId]);
            hasAfter = afterCheck.length > 0;
        }

        res.json({ messages, hasBefore, hasAfter });
    } catch (err) {
        console.error('Erreur récupération messages:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.post('/', auth, async (req, res) => {
    try {
        const { reportId } = req.params;
        const { content, isAnonymous } = req.body;
        const db = getPool();

        if (!content) return res.status(400).json({ error: 'Contenu requis' });

        const [reports] = await db.query(`SELECT user_id FROM reports WHERE id = ?`, [reportId]);
        if (reports.length === 0) return res.status(404).json({ error: 'Signalement non trouvé' });
        if (req.session.user.role === 'employee' && reports[0].user_id !== req.session.user.id) {
            return res.status(403).json({ error: 'Accès interdit' });
        }

        let senderRole = req.session.user.role;
        if (senderRole === 'employee') senderRole = 'employee';
        else if (senderRole === 'hr') senderRole = 'hr';
        else if (senderRole === 'legal') senderRole = 'legal';

        const [result] = await db.query(
            `INSERT INTO messages (report_id, sender_id, sender_role, content, is_anonymous)
             VALUES (?, ?, ?, ?, ?)`,
            [reportId, req.session.user.id, senderRole, content, !!isAnonymous]
        );

        await logAction(req, 'SEND_MESSAGE', 'message', result.insertId, null, { reportId, content });

        const [newMessage] = await db.query(
            `SELECT id, sender_id, sender_role, content, is_anonymous, created_at FROM messages WHERE id = ?`,
            [result.insertId]
        );

        res.json({ success: true, message: newMessage[0] });
    } catch (err) {
        console.error('Erreur envoi message:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;