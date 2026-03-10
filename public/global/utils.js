let csrfToken = null;

export async function getCsrfToken() {
    if (!csrfToken) {
        const res = await fetch('/api/csrf-token', { credentials: 'include' });
        const data = await res.json();
        csrfToken = data.csrfToken;
    }
    return csrfToken;
}

export async function apiFetch(url, options = {}) {
    const defaultOptions = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    if (options.method && options.method !== 'GET') {
        const token = await getCsrfToken();
        defaultOptions.headers['X-CSRF-Token'] = token;
    }
    const res = await fetch(url, { ...defaultOptions, ...options });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}