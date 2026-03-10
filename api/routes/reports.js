const express = require('express');
const { getPool } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const { logAction } = require('../utils/auditLogger');
const { upload } = require('../utils/fileHandler');
const router = express.Router();

function generateTrackingCode() {
    return 'RPT-' + Date.now() + '-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

router.post('/', auth, upload.array('attachments', 5), async (req, res) => {
    try {
        const { category, description, is_anonymous } = req.body;
        const db = getPool();
        const trackingCode = generateTrackingCode();

        if (!category || !description) {
            return res.status(400).json({ error: 'Catégorie et description requises' });
        }

        const [result] = await db.query(
            `INSERT INTO reports (tracking_code, user_id, category, description, status, is_anonymous)
             VALUES (?, ?, ?, ?, 'open', ?)`,
            [trackingCode, is_anonymous ? null : req.session.user.id, category, description, !!is_anonymous]
        );
        const reportId = result.insertId;

        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                await db.query(
                    `INSERT INTO attachments (report_id, filename, filepath, filesize, mime_type, uploaded_by)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [reportId, file.originalname, file.path, file.size, file.mimetype, req.session.user.id]
                );
            }
        }

        await logAction(req, 'CREATE_REPORT', 'report', reportId);
        res.json({ success: true, tracking_code: trackingCode, report_id: reportId });
    } catch (err) {
        console.error('Erreur création signalement:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/', auth, async (req, res) => {
    try {
        const db = getPool();
        let query = '';
        let params = [];

        if (req.session.user.role === 'employee') {
            query = `SELECT * FROM reports WHERE user_id = ? ORDER BY created_at DESC`;
            params = [req.session.user.id];
        } else {
            query = `SELECT * FROM reports ORDER BY created_at DESC`;
        }

        const [reports] = await db.query(query, params);
        res.json(reports);
    } catch (err) {
        console.error('Erreur liste signalements:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const db = getPool();
        const [reports] = await db.query(`SELECT * FROM reports WHERE id = ?`, [req.params.id]);

        if (reports.length === 0) return res.status(404).json({ error: 'Signalement non trouvé' });

        const report = reports[0];

        if (req.session.user.role === 'employee' && report.user_id !== req.session.user.id) {
            return res.status(403).json({ error: 'Accès interdit' });
        }

        const [messages] = await db.query(
            `SELECT * FROM messages WHERE report_id = ? ORDER BY created_at ASC`,
            [req.params.id]
        );

        const [attachments] = await db.query(
            `SELECT id, filename, filesize, mime_type, uploaded_at FROM attachments WHERE report_id = ?`,
            [req.params.id]
        );

        await logAction(req, 'VIEW_REPORT', 'report', req.params.id);

        res.json({ ...report, messages, attachments });
    } catch (err) {
        console.error('Erreur détail signalement:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.patch('/:id/status', auth, checkRole(['hr', 'legal', 'admin']), async (req, res) => {
    try {
        const { status, close_reason } = req.body;
        const db = getPool();

        const allowedStatuses = ['open', 'in_progress', 'waiting_info', 'closed_founded', 'closed_unfounded'];
        if (!allowedStatuses.includes(status))
            return res.status(400).json({ error: 'Statut invalide' });

        if (status.startsWith('closed') && !close_reason)
            return res.status(400).json({ error: 'Motif de clôture requis' });

        let query = `UPDATE reports SET status = ?`;
        let params = [status];

        if (status.startsWith('closed')) {
            query += `, closed_at = NOW(), closed_by = ?, close_reason = ?`;
            params.push(req.session.user.id, close_reason);
        }

        query += ` WHERE id = ?`;
        params.push(req.params.id);

        await db.query(query, params);
        await logAction(req, 'UPDATE_REPORT_STATUS', 'report', req.params.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Erreur changement statut:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;