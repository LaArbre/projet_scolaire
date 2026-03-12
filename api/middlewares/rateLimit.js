// middlewares/rateLimit.js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs:       15 * 60 * 1000, // 15 minutes
    max:            10,              // 10 tentatives par fenêtre
    message:        { error: true, fields: [] },
    standardHeaders: true,
    legacyHeaders:  false,
});

const apiLimiter = rateLimit({
    windowMs:       1 * 60 * 1000, // 1 minute
    max:            60,             // 60 requêtes/minute sur les routes sensibles
    message:        { error: 'Trop de requêtes, réessayez plus tard.' },
    standardHeaders: true,
    legacyHeaders:  false,
});

module.exports = { authLimiter, apiLimiter };
