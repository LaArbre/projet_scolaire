const express  = require('express');
const bcrypt   = require('bcryptjs');
const { getPool }    = require('../config/db');
const auth           = require('../middlewares/auth');
const checkRole      = require('../middlewares/checkRole');
const { logAction }  = require('../utils/auditLogger');
const {
    isValidEmail, isValidPassword, isValidFullname, isValidRole, isPositiveInt
} = require('../utils/validate');

const router = express.Router();
router.use(auth, checkRole(['admin']));

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const db = getPool();
        const [users] = await db.query(
            `SELECT id, fullname, email, role, failed_attempts, locked_until, created_at
             FROM users ORDER BY id DESC`
        );
        res.json(users);
    } catch (err) {
        console.error('Erreur liste utilisateurs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── POST /api/admin/users ─────────────────────────────────────────────────────
router.post('/users', async (req, res) => {
    try {
        const { fullname, email, password, role } = req.body;
        const db = getPool();

        if (!isValidFullname(fullname))
            return res.status(400).json({ error: 'Nom invalide' });
        if (!isValidEmail(email))
            return res.status(400).json({ error: 'Email invalide' });
        if (!isValidPassword(password))
            return res.status(400).json({ error: 'Mot de passe invalide (8 caractères min)' });
        if (!isValidRole(role))
            return res.status(400).json({ error: 'Rôle invalide' });

        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
        if (existing.length > 0)
            return res.status(400).json({ error: 'Email déjà utilisé' });

        const hashed = await bcrypt.hash(password, 12);
        const [result] = await db.query(
            'INSERT INTO users (fullname, email, password, role) VALUES (?, ?, ?, ?)',
            [fullname.trim(), email.toLowerCase().trim(), hashed, role]
        );

        await logAction(req, 'ADMIN_CREATE_USER', 'user', result.insertId, null, { email, role });
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Erreur création utilisateur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── PATCH /api/admin/users/:id ────────────────────────────────────────────────
router.patch('/users/:id', async (req, res) => {
    try {
        if (!isPositiveInt(req.params.id))
            return res.status(400).json({ error: 'ID invalide' });

        const targetId = parseInt(req.params.id, 10);
        const { fullname, email, role, locked_until } = req.body;
        const db = getPool();

        const updates = [], params = [];

        if (fullname !== undefined) {
            if (!isValidFullname(fullname))
                return res.status(400).json({ error: 'Nom invalide' });
            updates.push('fullname = ?'); params.push(fullname.trim());
        }
        if (email !== undefined) {
            if (!isValidEmail(email))
                return res.status(400).json({ error: 'Email invalide' });
            // Vérifier unicité
            const [dup] = await db.query(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email.toLowerCase().trim(), targetId]
            );
            if (dup.length > 0) return res.status(400).json({ error: 'Email déjà utilisé' });
            updates.push('email = ?'); params.push(email.toLowerCase().trim());
        }
        if (role !== undefined) {
            if (!isValidRole(role))
                return res.status(400).json({ error: 'Rôle invalide' });
            updates.push('role = ?'); params.push(role);
        }
        if (locked_until !== undefined) {
            updates.push('locked_until = ?'); params.push(locked_until || null);
        }

        if (updates.length === 0)
            return res.status(400).json({ error: 'Aucune modification fournie' });

        params.push(targetId);
        await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
        await logAction(req, 'ADMIN_UPDATE_USER', 'user', targetId, null, req.body);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur modification utilisateur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── DELETE /api/admin/users/:id — Soft disable ────────────────────────────────
router.delete('/users/:id', async (req, res) => {
    try {
        if (!isPositiveInt(req.params.id))
            return res.status(400).json({ error: 'ID invalide' });

        const targetId = parseInt(req.params.id, 10);

        // Protection auto-désactivation
        if (targetId === req.session.user.id)
            return res.status(400).json({ error: 'Impossible de se désactiver soi-même' });

        const db = getPool();

        // Vérifier que la cible existe
        const [rows] = await db.query('SELECT id FROM users WHERE id = ?', [targetId]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'Utilisateur non trouvé' });

        // Verrouillage permanent (locked_until très loin dans le futur)
        await db.query(
            "UPDATE users SET locked_until = '2099-12-31 23:59:59' WHERE id = ?",
            [targetId]
        );
        await logAction(req, 'ADMIN_DISABLE_USER', 'user', targetId);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur désactivation utilisateur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
