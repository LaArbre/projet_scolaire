require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');
const csrf = require('csurf');
const cors = require('cors');

const { initDB } = require('./config/db');
const { createSessionStore, getSessionConfig } = require('./config/session');
const { authLimiter, apiLimiter } = require('./middlewares/rateLimit');

const authRoutes       = require('./routes/auth');
const reportsRoutes    = require('./routes/reports');
const messagesRoutes   = require('./routes/messages');
const attachmentsRoutes = require('./routes/attachments');
const adminRoutes      = require('./routes/admin');
const auditRoutes      = require('./routes/audit');

// ── Validation des variables d'environnement obligatoires ────────────────────
const REQUIRED_ENV = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'SESSION_SECRET', 'FRONTEND_URL'];
for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
        console.error(`Variable d'environnement manquante : ${key}`);
        process.exit(1);
    }
}

const app = express();

// ── Sécurité HTTP ────────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
            scriptSrc:  ["'self'"],
            imgSrc:     ["'self'", 'data:'],
            connectSrc: ["'self'"],
        },
    },
}));

app.use(cors({
    origin:         process.env.FRONTEND_URL,
    credentials:    true,
    methods:        ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
}));

// express.json() intégré — body-parser n'est plus nécessaire
app.use(express.json({ limit: '10kb' }));

// Faire confiance au premier proxy (Nginx) pour X-Forwarded-For et X-Forwarded-Proto
app.set('trust proxy', 1);

async function startServer() {
    try {
        if (process.env.NODE_ENV === 'development' && process.env.RESET_DB === 'true') {
            const { resetDatabase } = require('./reset');
            await resetDatabase();
        }

        const pool         = await initDB();
        const sessionStore = createSessionStore(pool);
        const sessionConfig = getSessionConfig(sessionStore);
        app.use(session(sessionConfig));

        // ── Rate limiting ────────────────────────────────────────────────────
        app.use('/api/login',    authLimiter);
        app.use('/api/register', authLimiter);
        app.use('/api/reports',  apiLimiter);

        // ── Protection CSRF ──────────────────────────────────────────────────
        const csrfProtection = csrf({
            cookie: false,
            value:  (req) => req.headers['x-csrf-token'],
        });

        // Login et register sont exemptés (pas de session active à ce stade)
        // Logout est protégé : un attaquant ne doit pas pouvoir déconnecter un utilisateur via CSRF
        const CSRF_EXEMPT = ['/api/login', '/api/register'];
        app.use((req, res, next) => {
            if (CSRF_EXEMPT.includes(req.path) && req.method === 'POST') return next();
            csrfProtection(req, res, (err) => {
                if (err) return res.status(403).json({ error: 'Token CSRF invalide' });
                next();
            });
        });

        // ── Routes ───────────────────────────────────────────────────────────
        app.use('/api',                             authRoutes);
        app.use('/api/reports',                     reportsRoutes);
        app.use('/api/reports/:reportId/messages',  messagesRoutes);
        app.use('/api/attachments',                 attachmentsRoutes);
        app.use('/api/admin',                       adminRoutes);
        app.use('/api/audit-logs',                  auditRoutes);

        // ── Frontend statique ─────────────────────────────────────────────────
        app.use(express.static(path.join(__dirname, '../public')));
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        // ── Gestionnaire d'erreurs global ────────────────────────────────────
        // Intercepte notamment les erreurs multer et les erreurs non catchées dans les middlewares
        app.use((err, req, res, next) => {
            console.error('Erreur non gérée :', err);
            const status = err.status || err.statusCode || 500;
            res.status(status).json({ error: 'Erreur serveur' });
        });

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, '127.0.0.1', () => {
            console.log(`Serveur démarré sur http://127.0.0.1:${PORT} [${process.env.NODE_ENV || 'production'}]`);
        });

    } catch (err) {
        console.error('Erreur initialisation :', err);
        process.exit(1);
    }
}

startServer();
