const express = require('express');
const { getPool } = require('../config/db');
const auth = require('../middlewares/auth');
const checkRole = require('../middlewares/checkRole');
const bcrypt = require('bcryptjs');
const { logAction } = require('../utils/auditLogger');
const router = express.Router();

router.use(auth, checkRole(['admin']));

router.get('/users', async (req, res) => {
    try {
        const db = getPool();
        const [users] = await db.query(
            `SELECT id, fullname, email, role, failed_attempts, locked_until, created_at FROM users ORDER BY id DESC`
        );
        res.json(users);
    } catch (err) {
        console.error('Erreur liste utilisateurs:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.post('/users', async (req, res) => {
    try {
        const { fullname, email, password, role } = req.body;
        const db = getPool();

        if (!fullname || !email || !password || !role) {
            return res.status(400).json({ error: 'Champs requis' });
        }

        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email déjà utilisé' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await db.query(
            'INSERT INTO users (fullname, email, password, role) VALUES (?, ?, ?, ?)',
            [fullname, email, hashedPassword, role]
        );

        await logAction(req, 'ADMIN_CREATE_USER', 'user', result.insertId);
        res.json({ success: true, id: result.insertId });
    } catch (err) {
        console.error('Erreur création utilisateur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.patch('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { fullname, email, role, locked_until } = req.body;
        const db = getPool();

        const updates = [];
        const params = [];

        if (fullname) {
            updates.push('fullname = ?');
            params.push(fullname);
        }
        if (email) {
            updates.push('email = ?');
            params.push(email);
        }
        if (role) {
            updates.push('role = ?');
            params.push(role);
        }
        if (locked_until !== undefined) {
            updates.push('locked_until = ?');
            params.push(locked_until);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'Aucune modification' });
        }

        params.push(id);
        await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
        await logAction(req, 'ADMIN_UPDATE_USER', 'user', id);

        res.json({ success: true });
    } catch (err) {
        console.error('Erreur modification utilisateur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.delete('/users/:id', async (req, res) => {
    try {
        const db = getPool();
        await db.query('UPDATE users SET locked_until = NOW() WHERE id = ?', [req.params.id]);
        await logAction(req, 'ADMIN_DISABLE_USER', 'user', req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur désactivation utilisateur:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;