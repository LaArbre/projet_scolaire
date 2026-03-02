const express = require('express');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const { getPool } = require('../config/db');
const router = express.Router();

function validateEmail(email) {
    return validator.isEmail(email) && email.length <= 255;
}
function validatePassword(password) {
    return password && password.length >= 8;
}

router.post('/register', async (req, res) => {
    try {
        let { fullname, email, password } = req.body;
        const db = getPool();
        fullname = fullname.trim();
        email = email.toLowerCase().trim();
        if (!fullname || fullname.length < 2 || fullname.length > 100) {
            return res.status(400).json({ error: true, fields: ['name'] });
        }
        if (!validateEmail(email)) {
            return res.status(400).json({ error: true, fields: ['email'] });
        }
        const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
        if (rows.length > 0) {
            return res.status(400).json({ error: true, fields: ['email'] });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const [result] = await db.query(
            'INSERT INTO users (fullname, email, password, admin) VALUES (?, ?, ?, ?)',
            [fullname, email, hashedPassword, false]
        );
        req.session.user = {
            id: result.insertId,
            fullname,
            email,
            admin: false
        };
        res.json({
            success: true,
            fields: ['name', 'email', 'password', 'confirm'],
            user: req.session.user
        });
    } catch (err) {
        console.error('Erreur register:', err);
        res.status(500).json({ error: true, fields: [] });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const db = getPool();
        if (!email || !password) {
            return res.status(400).json({ error: true, fields: ['email', 'password'] });
        }
        const [rows] = await db.query(
            'SELECT id, fullname, email, password, admin, failed_attempts, locked_until FROM users WHERE email = ?',
            [email.toLowerCase().trim()]
        );
        if (rows.length === 0) {
            await bcrypt.compare('fake_password', '$2b$12$' + 'B'.repeat(53));
            return res.status(400).json({ error: true, fields: ['email', 'password'] });
        }
        const user = rows[0];
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(400).json({ error: true, fields: ['email', 'password'] });
        }
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            await db.query(
                'UPDATE users SET failed_attempts = failed_attempts + 1 WHERE id = ?',
                [user.id]
            );
            if (user.failed_attempts >= 4) {
                const lockUntil = new Date(Date.now() + 15 * 60 * 1000);
                await db.query(
                    'UPDATE users SET locked_until = ? WHERE id = ?',
                    [lockUntil, user.id]
                );
            }
            return res.status(400).json({ error: true, fields: ['email', 'password'] });
        }
        await db.query(
            'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
            [user.id]
        );
        req.session.regenerate(async (err) => {
            if (err) {
                return res.status(500).json({ error: true, fields: [] });
            }
            req.session.user = {
                id: user.id,
                fullname: user.fullname,
                email: user.email,
                admin: user.admin === 1
            };
            res.json({
                success: true,
                fields: ['email', 'password'],
                user: req.session.user
            });
        });
    } catch (err) {
        console.error('Erreur login:', err);
        res.status(500).json({ error: true, fields: [] });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: true, fields: [] });
        }
        res.clearCookie('session_id');
        res.json({ success: true, fields: [] });
    });
});

router.get('/check-session', (req, res) => {
    if (req.session.user) {
        res.json({
            authenticated: true,
            user: req.session.user
        });
    } else {
        res.json({ authenticated: false });
    }
});

router.get('/csrf-token', (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

module.exports = router;