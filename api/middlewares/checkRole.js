module.exports = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        if (!allowedRoles.includes(req.session.user.role)) {
            return res.status(403).json({ error: 'Accès interdit' });
        }
        next();
    };
};