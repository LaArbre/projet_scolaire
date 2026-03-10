const express = require('express');
const { getPool } = require('../config/db');
const auth = require('../middlewares/auth');
const path = require('path');
const fs = require('fs').promises;
const router = express.Router();

router.get('/:id', auth, async (req, res) => {
    try {
        const db = getPool();
        const [attachments] = await db.query(
            `SELECT a.*, r.user_id as report_user_id FROM attachments a
             JOIN reports r ON a.report_id = r.id
             WHERE a.id = ?`,
            [req.params.id]
        );

        if (attachments.length === 0) return res.status(404).json({ error: 'Fichier non trouvé' });

        const attachment = attachments[0];

        if (req.session.user.role === 'employee' && attachment.report_user_id !== req.session.user.id) {
            return res.status(403).json({ error: 'Accès interdit' });
        }

        const filePath = attachment.filepath;
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).json({ error: 'Fichier non trouvé sur le disque' });
        }

        res.download(filePath, attachment.filename);
    } catch (err) {
        console.error('Erreur téléchargement:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;