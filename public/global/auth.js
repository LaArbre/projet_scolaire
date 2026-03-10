export async function getSession() {
    const res = await fetch('/api/check-session', { credentials: 'include' });
    return res.json();
}

export async function logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
}