export async function getSession() {
    const res = await fetch('/api/check-session', { credentials: 'include' });
    return res.json();
}

export async function logout() {
    let csrfToken = null;
    try {
        const res = await fetch('/api/csrf-token', { credentials: 'include' });
        if (res.ok) csrfToken = (await res.json()).csrfToken;
    } catch {}

    await fetch('/api/logout', {
        method:      'POST',
        credentials: 'include',
        headers:     csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
    });
}
