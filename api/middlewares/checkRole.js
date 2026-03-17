const VALID_ROLES = ['employee', 'hr', 'legal', 'admin'];

module.exports = (allowedRoles) => {
    if (!allowedRoles.every(r => VALID_ROLES.includes(r))) {
        throw new Error(`checkRole: rôle inconnu dans [${allowedRoles}]`);
    }
    return (req, res, next) => {
        if (!req.session?.user) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        if (!allowedRoles.includes(req.session.user.role)) {
            return res.status(403).json({ error: 'Accès interdit' });
        }
        next();
    };
};