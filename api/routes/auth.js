const express  = require('express');
const bcrypt   = require('bcryptjs');
const { getPool }   = require('../config/db');
const { logAction } = require('../utils/auditLogger');
const { insertLog } = require('../utils/logLogger'); // Elio
const { isValidEmail, isValidPassword, isValidFullname } = require('../utils/validate');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        let { fullname, email, password } = req.body;
        if (!fullname || !email || !password) {
            return res.status(400).json({ error: true, fields: ['name', 'email', 'password'] });
        }

        fullname = fullname.trim();
        email    = email.toLowerCase().trim();

        if (!isValidFullname(fullname))
            return res.status(400).json({ error: true, fields: ['name'] });
        if (!isValidEmail(email))
            return res.status(400).json({ error: true, fields: ['email'] });
        if (!isValidPassword(password))
            return res.status(400).json({ error: true, fields: ['password'] });

        const db = getPool();
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0)
            return res.status(400).json({ error: true, fields: ['email'] });

        const hashed = await bcrypt.hash(password, 12);
        const [result] = await db.query(
            'INSERT INTO users (fullname, email, password, role) VALUES (?, ?, ?, ?)',
            [fullname, email, hashed, 'employee']
        );

        req.session.regenerate(async (err) => {
            if (err) return res.status(500).json({ error: true, fields: [] });
            req.session.user = { id: result.insertId, fullname, email, role: 'employee' };
            await logAction(req, 'REGISTER', 'user', result.insertId);
            res.json({ success: true, user: req.session.user });
        });
    } catch (err) {
        console.error('Erreur register:', err);
        res.status(500).json({ error: true, fields: [] });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: true, fields: ['email', 'password'] });

        const db = getPool();
        const [rows] = await db.query(
            `SELECT id, fullname, email, password, role, failed_attempts, locked_until
             FROM users WHERE email = ?`,
            [email.toLowerCase().trim()]
        );

        if (rows.length === 0) {
            await bcrypt.compare('__fake__', '$2b$12$' + 'B'.repeat(53));
            return res.status(400).json({ error: true, fields: ['email', 'password'] });
        }

        const user = rows[0];

        if (user.locked_until && new Date(user.locked_until) < new Date()) {
            await db.query(
                'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
                [user.id]
            );
            user.failed_attempts = 0;
            user.locked_until    = null;
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(400).json({ error: true, fields: ['email', 'password'] });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            const newAttempts = user.failed_attempts + 1;
            if (newAttempts >= 5) {
                const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                await db.query(
                    'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
                    [newAttempts, lockUntil, user.id]
                );
            } else {
                await db.query(
                    'UPDATE users SET failed_attempts = ? WHERE id = ?',
                    [newAttempts, user.id]
                );
            }
            await logAction(req, 'LOGIN_FAILED', 'user', user.id);
            await insertLog(user.id, 'Échec de connexion', req.ip);  // Elio
            return res.status(400).json({ error: true, fields: ['email', 'password'] });
        }

        await db.query(
            'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
            [user.id]
        );

        req.session.regenerate(async (err) => {
            if (err) return res.status(500).json({ error: true, fields: [] });
            req.session.user = {
                id:       user.id,
                fullname: user.fullname,
                email:    user.email,
                role:     user.role,
            };
            await logAction(req, 'LOGIN', 'user', user.id);
            await insertLog(user.id, 'Connexion réussie', req.ip);  // Elio
            res.json({ success: true, user: req.session.user });
        });
    } catch (err) {
        console.error('Erreur login:', err);
        res.status(500).json({ error: true, fields: [] });
    }
});

router.post('/logout', (req, res) => {  // Elio modification pour insterLog
    const user = req.session?.user;
    req.session.destroy(async (err) => {
        if (err) return res.status(500).json({ error: true });
        if (user) {
            await insertLog(user.id, 'Déconnexion', req.ip);
        }
        res.clearCookie('sid');
        res.json({ success: true });
    });
});

router.get('/check-session', (req, res) => {
    if (req.session?.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

router.get('/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

module.exports = router;
