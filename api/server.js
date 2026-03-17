require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');
const csrf = require('csurf');

const { initDB } = require('./config/db');
const { createSessionStore, getSessionConfig } = require('./config/session');
const { authLimiter, apiLimiter } = require('./middlewares/rateLimit');

const authRoutes = require('./routes/auth');
const reportsRoutes = require('./routes/reports');
const messagesRoutes = require('./routes/messages');
const attachmentsRoutes = require('./routes/attachments');
const adminRoutes = require('./routes/admin');
const auditRoutes = require('./routes/audit');

const app = express();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
        },
    },
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
}));

app.use(bodyParser.json({ limit: '10kb' }));
app.set('trust proxy', 1);

async function startServer() {
    try {
        if (process.env.NODE_ENV === '1' && process.env.RESET_DB === 'true') {
            const { resetDatabase } = require('./reset');
            await resetDatabase();
        }

        const pool = await initDB();
        const sessionStore = createSessionStore(pool);
        const sessionConfig = getSessionConfig(sessionStore);
        app.use(session(sessionConfig));

        app.use('/api/login', authLimiter);
        app.use('/api/register', authLimiter);
        app.use('/api/reports', apiLimiter);

        const csrfProtection = csrf({
            cookie: false,
            value: (req) => req.headers['x-csrf-token'],
        });

        app.use((req, res, next) => {
            const exempt = ['/api/login', '/api/register', '/api/logout'];
            if (exempt.includes(req.path) && req.method === 'POST') return next();
            csrfProtection(req, res, (err) => {
                if (err) {
                    return res.status(403).json({ error: 'Token CSRF invalide' });
                }
                next();
            });
        });

        app.use('/api', authRoutes);
        app.use('/api/reports', reportsRoutes);
        app.use('/api/reports/:reportId/messages', messagesRoutes);
        app.use('/api/attachments', attachmentsRoutes);
        app.use('/api/admin', adminRoutes);
        app.use('/api/audit-logs', auditRoutes);

        app.use(express.static(path.join(__dirname, '../public')));

        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/index.html'));
        });

        const PORT = process.env.PORT || 3000;
        app.listen(PORT, '127.0.0.1', () => {
            console.log(`Serveur démarré sur http://127.0.0.1:${PORT}`);
        });

    } catch (err) {
        console.error('Erreur initialisation :', err);
        process.exit(1);
    }
}

startServer();