let csrfToken = null;

export async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    try {
        const res  = await fetch('/api/csrf-token', { credentials: 'include' });
        if (!res.ok) return null;
        const data = await res.json();
        csrfToken  = data.csrfToken;
        return csrfToken;
    } catch {
        return null;
    }
}

export function invalidateCsrf() {
    csrfToken = null;
}

export async function apiFetch(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    if (options.method && options.method !== 'GET') {
        const token = await getCsrfToken();
        if (token) headers['X-CSRF-Token'] = token;
    }

    const res = await fetch(url, {
        credentials: 'include',
        ...options,
        headers,
    });

    if (res.status === 403) invalidateCsrf();

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
    }
    return res.json();
}

/**
 * Échappe les caractères HTML dangereux (protection XSS côté affichage)
 */
export function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#039;');
}

export function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
        day:   '2-digit', month: '2-digit', year: 'numeric',
    });
}

export function formatDateTime(dateStr) {
    return new Date(dateStr).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export const STATUS_LABELS = {
    open:             'Ouvert',
    in_progress:      'En cours',
    waiting_info:     'Attente info',
    closed_founded:   'Clôturé fondé',
    closed_unfounded: 'Clôturé non fondé',
};

export const ROLE_LABELS = {
    employee: 'Employé',
    hr:       'RH',
    legal:    'Juriste',
    admin:    'Admin',
    system:   'Système',
};
