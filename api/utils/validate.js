const validator = require('validator');

const ALLOWED_ROLES = ['employee', 'hr', 'legal', 'admin'];
const ALLOWED_CATEGORIES = [
    'Harcèlement moral',
    'Harcèlement sexuel',
    'Discrimination',
    'Conflit hiérarchique',
    'Atteinte à l\'éthique',
    'Autre',
];
const ALLOWED_STATUSES = ['open', 'in_progress', 'waiting_info', 'closed_founded', 'closed_unfounded'];

function isValidEmail(email) {
    return typeof email === 'string' && validator.isEmail(email) && email.length <= 255;
}

function isValidPassword(password) {
    return typeof password === 'string' && password.length >= 8;
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
};