const express  = require('express');
const crypto   = require('crypto');
const { getPool }    = require('../config/db');
const auth           = require('../middlewares/auth');
const checkRole      = require('../middlewares/checkRole');
const { logAction }  = require('../utils/auditLogger');
const { upload, sanitizeFilename } = require('../utils/fileHandler');
const {
    isValidCategory, isValidStatus, isPositiveInt,
} = require('../utils/validate');

const router = express.Router();

/**
 * Génère un code de suivi unique avec retry en cas de collision (contrainte UNIQUE en DB).
 */
async function generateTrackingCode(db, maxRetries = 5) {
    for (let i = 0; i < maxRetries; i++) {
        const code = 'RPT-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const [rows] = await db.query('SELECT id FROM reports WHERE tracking_code = ?', [code]);
        if (rows.length === 0) return code;
    }
    throw new Error('Impossible de générer un code de suivi unique après plusieurs tentatives');
}

// ── POST /api/reports — Créer un signalement ─────────────────────────────────
router.post('/', auth, upload.array('attachments', 5), async (req, res) => {
    try {
        const { title, category, description, is_anonymous } = req.body;
        const db = getPool();

        if (!title || !title.trim() || title.length > 255)
            return res.status(400).json({ error: 'Titre invalide (1-255 caractères)' });
        if (!isValidCategory(category))
            return res.status(400).json({ error: 'Catégorie invalide' });
        if (!description || !description.trim() || description.length > 10000)
            return res.status(400).json({ error: 'Description invalide (1-10000 caractères)' });

        const trackingCode = await generateTrackingCode(db);
        const [result] = await db.query(
            `INSERT INTO reports
             (tracking_code, title, user_id, category, description, status, is_anonymous)
             VALUES (?, ?, ?, ?, ?, 'open', ?)`,
            [trackingCode, title.trim(), req.session.user.id, category, description.trim(), !!is_anonymous]
        );
        const reportId = result.insertId;

        if (req.files?.length > 0) {
            for (const file of req.files) {
                // Sanitisation du nom original avant stockage
                const safeName = sanitizeFilename(file.originalname);
                await db.query(
                    `INSERT INTO attachments
                     (report_id, filename, filepath, filesize, mime_type, uploaded_by)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [reportId, safeName, file.path, file.size, file.mimetype, req.session.user.id]
                );
            }
        }

        await logAction(req, 'CREATE_REPORT', 'report', reportId, null, { category, title });
        res.json({ success: true, tracking_code: trackingCode, report_id: reportId });
    } catch (err) {
        console.error('Erreur création signalement:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── GET /api/reports — Liste paginée ─────────────────────────────────────────
router.get('/', auth, async (req, res) => {
    try {
        const db     = getPool();
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 100);
        const offset = Math.max(parseInt(req.query.offset) || 0,  0);

        let query, countQuery, params, countParams;

        if (req.session.user.role === 'employee') {
            countQuery  = 'SELECT COUNT(*) AS total FROM reports WHERE user_id = ?';
            countParams = [req.session.user.id];
            query       = `SELECT id, tracking_code, title, category, status, is_anonymous, created_at, updated_at
                           FROM reports WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            params      = [req.session.user.id, limit, offset];
        } else {
            countQuery  = 'SELECT COUNT(*) AS total FROM reports';
            countParams = [];
            query       = `SELECT id, tracking_code, title, category, status, is_anonymous, created_at, updated_at
                           FROM reports ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            params      = [limit, offset];
        }

        const [[{ total }]] = await db.query(countQuery, countParams);
        const [reports]     = await db.query(query, params);

        res.json({ reports, total, limit, offset });
    } catch (err) {
        console.error('Erreur liste signalements:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── GET /api/reports/:id — Détail ────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
    try {
        if (!isPositiveInt(req.params.id))
            return res.status(400).json({ error: 'ID invalide' });

        const reportId = parseInt(req.params.id, 10);
        const db = getPool();

        const [reports] = await db.query(
            `SELECT id, tracking_code, title, user_id, category, description,
                    status, is_anonymous, ai_category, ai_confidence,
                    created_at, updated_at, closed_at, close_reason
             FROM reports WHERE id = ?`,
            [reportId]
        );
        if (reports.length === 0)
            return res.status(404).json({ error: 'Signalement non trouvé' });

        const report = reports[0];
        if (req.session.user.role === 'employee' && report.user_id !== req.session.user.id)
            return res.status(403).json({ error: 'Accès interdit' });

        const [attachments] = await db.query(
            `SELECT id, filename, filesize, mime_type, uploaded_at
             FROM attachments WHERE report_id = ? AND message_id IS NULL`,
            [reportId]
        );

        await logAction(req, 'VIEW_REPORT', 'report', reportId);
        res.json({ ...report, attachments });
    } catch (err) {
        console.error('Erreur détail signalement:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── PATCH /api/reports/:id/status — Changer le statut ────────────────────────
router.patch('/:id/status', auth, checkRole(['hr', 'legal', 'admin']), async (req, res) => {
    try {
        if (!isPositiveInt(req.params.id))
            return res.status(400).json({ error: 'ID invalide' });

        const reportId = parseInt(req.params.id, 10);
        const { status, close_reason } = req.body;
        const db = getPool();

        if (!isValidStatus(status))
            return res.status(400).json({ error: 'Statut invalide' });

        const [reports] = await db.query('SELECT id, status FROM reports WHERE id = ?', [reportId]);
        if (reports.length === 0)
            return res.status(404).json({ error: 'Signalement non trouvé' });

        const isClosure = status.startsWith('closed');
        if (isClosure && (!close_reason || !close_reason.trim()))
            return res.status(400).json({ error: 'Motif de clôture obligatoire' });

        const oldStatus = reports[0].status;

        let query  = 'UPDATE reports SET status = ?, updated_at = NOW()';
        let params = [status];

        if (isClosure) {
            query  += ', closed_at = NOW(), closed_by = ?, close_reason = ?';
            params.push(req.session.user.id, close_reason.trim());
        }

        query += ' WHERE id = ?';
        params.push(reportId);

        await db.query(query, params);

        const statusLabels = {
            open:             'Ouvert',
            in_progress:      'En cours',
            waiting_info:     "En attente d'informations",
            closed_founded:   'Clôturé (fondé)',
            closed_unfounded: 'Clôturé (non fondé)',
        };

        await db.query(
            `INSERT INTO messages (report_id, sender_id, sender_role, content, is_anonymous)
             VALUES (?, ?, 'system', ?, false)`,
            [
                reportId,
                req.session.user.id,
                `Statut mis à jour : ${statusLabels[oldStatus]} → ${statusLabels[status]}` +
                (isClosure ? ` — Motif : ${close_reason.trim()}` : ''),
            ]
        );

        await logAction(req, 'UPDATE_STATUS', 'report', reportId,
            { status: oldStatus }, { status, close_reason });

        res.json({ success: true });
    } catch (err) {
        console.error('Erreur changement statut:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
