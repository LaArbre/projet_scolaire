const validator = require('validator');

const ALLOWED_ROLES = ['employee', 'hr', 'legal', 'admin'];
const ALLOWED_CATEGORIES = [
    'Harcèlement moral',
    'Harcèlement sexuel',
    'Discrimination',
    'Conflit hiérarchique',
    "Atteinte à l'éthique",
    'Autre',
];
const ALLOWED_STATUSES = ['open', 'in_progress', 'waiting_info', 'closed_founded', 'closed_unfounded'];

function isValidEmail(email) {
    return typeof email === 'string' && validator.isEmail(email) && email.length <= 255;
}

/**
 * Mot de passe fort : 8 caractères min, 1 majuscule, 1 minuscule, 1 chiffre, 1 symbole.
 * validator.isStrongPassword() est déjà disponible dans les dépendances.
 */
function isValidPassword(password) {
    if (typeof password !== 'string') return false;
    return validator.isStrongPassword(password, {
        minLength:        8,
        minLowercase:     1,
        minUppercase:     1,
        minNumbers:       1,
        minSymbols:       1,
    });
}

function isValidFullname(name) {
    return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100;
}

function isValidRole(role) {
    return ALLOWED_ROLES.includes(role);
}

function isValidCategory(cat) {
    return ALLOWED_CATEGORIES.includes(cat);
}

function isValidStatus(status) {
    return ALLOWED_STATUSES.includes(status);
}

function isPositiveInt(value) {
    const n = parseInt(value, 10);
    return !isNaN(n) && n > 0;
}

/**
 * Valide qu'une valeur est une date ISO 8601 ou null/undefined.
 * Utilisé pour locked_until dans admin.js.
 */
function isValidDateOrNull(value) {
    if (value === null || value === undefined || value === '') return true;
    return typeof value === 'string' && validator.isISO8601(value);
}

/**
 * Échappe les wildcards SQL LIKE pour éviter les full scans involontaires.
 */
function escapeLike(str) {
    return str.replace(/[%_\\]/g, '\\$&');
}

module.exports = {
    ALLOWED_ROLES,
    ALLOWED_CATEGORIES,
    ALLOWED_STATUSES,
    isValidEmail,
    isValidPassword,
    isValidFullname,
    isValidRole,
    isValidCategory,
    isValidStatus,
    isPositiveInt,
    isValidDateOrNull,
    escapeLike,
};
