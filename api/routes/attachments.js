const express  = require('express');
const path     = require('path');
const fs       = require('fs').promises;
const { getPool }       = require('../config/db');
const auth              = require('../middlewares/auth');
const { isSafeFilePath } = require('../utils/fileHandler');
const { isPositiveInt }  = require('../utils/validate');

const router = express.Router();

router.get('/:id', auth, async (req, res) => {
    try {
        if (!isPositiveInt(req.params.id))
            return res.status(400).json({ error: 'ID invalide' });

        const db = getPool();
        const [rows] = await db.query(
            `SELECT a.*, r.user_id AS report_user_id
             FROM attachments a
             JOIN reports r ON a.report_id = r.id
             WHERE a.id = ?`,
            [parseInt(req.params.id, 10)]
        );

        if (rows.length === 0)
            return res.status(404).json({ error: 'Fichier non trouvé' });

        const attachment = rows[0];

        // Vérification des droits
        if (req.session.user.role === 'employee' &&
            attachment.report_user_id !== req.session.user.id)
            return res.status(403).json({ error: 'Accès interdit' });

        // Protection path traversal
        if (!isSafeFilePath(attachment.filepath))
            return res.status(403).json({ error: 'Chemin non autorisé' });

        // Vérification existence sur le disque
        try {
            await fs.access(attachment.filepath);
        } catch {
            return res.status(404).json({ error: 'Fichier introuvable sur le disque' });
        }

        res.download(attachment.filepath, attachment.filename);
    } catch (err) {
        console.error('Erreur téléchargement:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
