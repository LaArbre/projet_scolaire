require('dotenv').config({ path: __dirname + '/.env', override: true });
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');
const csrf = require('csurf');

const { initDB } = require('./config/db');
const { createSessionStore, getSessionConfig } = require('./config/session');

const limiter = require('./middlewares/rateLimit');
const authRoutes = require('./routes/auth');

const app = express();

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
        },
    },
}));

app.use(cors({
    origin: ['https://192.168.1.92', 'http://192.168.1.92'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

app.use(bodyParser.json({ limit: '10kb' }));
app.set('trust proxy', 1);

async function startServer() {
    try {
        const pool = await initDB();
        const sessionStore = createSessionStore(pool);
        const sessionConfig = getSessionConfig(sessionStore);
        app.use(session(sessionConfig));

        app.use('/api/login', limiter);
        app.use('/api/register', limiter);

        const csrfProtection = csrf({ 
            cookie: false,
            value: (req) => req.headers['x-csrf-token']
        });

        app.use((req, res, next) => {
            if ((req.path === '/api/login' || req.path === '/api/register') && req.method === 'POST') {
                return next();
            }
            csrfProtection(req, res, next);
        });

        app.use('/api', authRoutes);

        app.use(express.static(path.join(__dirname, '../public')));

        const PORT = 3000;
        app.listen(PORT, '127.0.0.1', () => {
            console.log(`Node.js écoute sur http://127.0.0.1:${PORT}`);
        });

    } catch (err) {
        console.error('Erreur lors de l\'initialisation :', err);
        process.exit(1);
    }
}

startServer();
