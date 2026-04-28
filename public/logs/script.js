const state = {
    user: null,
    csrfToken: null,
    allLogs: [],
    filters: { user: '', event: '', dateFrom: '', dateTo: '' }
};

const elements = {
    topbarAvatar:    document.getElementById('topbarAvatar'),
    topbarName:      document.getElementById('topbarName'),
    btnLogout:       document.getElementById('btnLogout'),
    liveIndicator:   document.getElementById('liveIndicator'),
    cntLogin:        document.getElementById('cntLogin'),
    cntFail:         document.getElementById('cntFail'),
    cntConsult:      document.getElementById('cntConsult'),
    cntLogout:       document.getElementById('cntLogout'),
    cntVisible:      document.getElementById('cntVisible'),
    filterUser:      document.getElementById('filterUser'),
    filterEvent:     document.getElementById('filterEvent'),
    filterDateFrom:  document.getElementById('filterDateFrom'),
    filterDateTo:    document.getElementById('filterDateTo'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    tableBody:       document.getElementById('tableBody'),
    tableCount:      document.getElementById('tableCount'),
    toastContainer:  document.getElementById('toastContainer')
};

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span class="toast-msg">${escapeHtml(message)}</span><button class="toast-close">×</button>`;
    elements.toastContainer.appendChild(toast);
    const remove = () => { toast.classList.add('toast-out'); setTimeout(() => toast.remove(), 200); };
    toast.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, duration);
}

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = String(text ?? '');
    return d.innerHTML;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

async function apiCall(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (state.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(options.method || 'GET'))
        headers['X-CSRF-Token'] = state.csrfToken;
    const res = await fetch(url, { credentials: 'include', ...options, headers });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Erreur ${res.status}`); }
    return res.json();
}

async function checkSession() {
    try {
        const data = await apiCall('/api/check-session');
        if (data.authenticated) {
            state.user = data.user;
            elements.topbarName.textContent = state.user.fullname || state.user.email;
            elements.topbarAvatar.textContent = (state.user.fullname || state.user.email).charAt(0).toUpperCase();
            const csrf = await apiCall('/api/csrf-token');
            state.csrfToken = csrf.csrfToken;
            return true;
        }
        return false;
    } catch { return false; }
}

async function logout() {
    try { await apiCall('/api/logout', { method: 'POST' }); window.location.href = '/login/'; }
    catch { showToast('Erreur lors de la déconnexion', 'error'); }
}

const EVENT_BADGE = {
    'Connexion réussie':        'badge-success',
    'Échec de connexion':       'badge-danger',
    'Consultation signalement': 'badge-info',
    'Déconnexion':              'badge-muted'
};

function applyFilters() {
    const { user, event, dateFrom, dateTo } = state.filters;
    const searchLower = user.toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to   = dateTo   ? new Date(dateTo + 'T23:59:59') : null;

    return state.allLogs.filter(log => {
        if (searchLower) {
            const nameMatch  = log.fullname?.toLowerCase().includes(searchLower);
            const emailMatch = log.email?.toLowerCase().includes(searchLower);
            if (!nameMatch && !emailMatch) return false;
        }
        if (event && log.name !== event) return false;
        const d = new Date(log.date);
        if (from && d < from) return false;
        if (to   && d > to)   return false;
        return true;
    });
}

function updateStats() {
    const counts = { login: 0, fail: 0, consult: 0, logout: 0 };
    state.allLogs.forEach(l => {
        if (l.name === 'Connexion réussie')        counts.login++;
        else if (l.name === 'Échec de connexion')  counts.fail++;
        else if (l.name === 'Consultation signalement') counts.consult++;
        else if (l.name === 'Déconnexion')         counts.logout++;
    });
    elements.cntLogin.textContent   = counts.login;
    elements.cntFail.textContent    = counts.fail;
    elements.cntConsult.textContent = counts.consult;
    elements.cntLogout.textContent  = counts.logout;
}

function renderTable() {
    const visible = applyFilters();
    elements.cntVisible.textContent = visible.length;
    elements.tableCount.textContent = `${visible.length} résultat${visible.length !== 1 ? 's' : ''} (${state.allLogs.length} au total)`;

    if (visible.length === 0) {
        elements.tableBody.innerHTML = `<tr class="empty-row"><td colspan="5">Aucun log trouvé</td></tr>`;
        return;
    }

    elements.tableBody.innerHTML = visible.map(log => `
        <tr class="row-enter">
            <td class="date-cell">${escapeHtml(formatDate(log.date))}</td>
            <td><span class="event-badge ${EVENT_BADGE[log.name] || 'badge-muted'}">${escapeHtml(log.name)}</span></td>
            <td class="user-cell">${escapeHtml(log.fullname)}</td>
            <td class="email-cell">${escapeHtml(log.email)}</td>
            <td class="info-cell">${escapeHtml(log.info)}</td>
        </tr>
    `).join('');
}

async function fetchLogs() {
    try {
        const data = await apiCall('/api/logs?limit=1000');
        state.allLogs = data.logs || [];
        updateStats();
        renderTable();
        elements.liveIndicator.style.display = 'flex';
    } catch (err) {
        showToast('Erreur lors du chargement des logs', 'error');
        elements.tableBody.innerHTML = `<tr class="empty-row"><td colspan="5">Erreur de chargement</td></tr>`;
    }
}

function bindEvents() {
    elements.btnLogout.addEventListener('click', logout);

    elements.filterUser.addEventListener('input', debounce(() => {
        state.filters.user = elements.filterUser.value;
        renderTable();
    }, 200));

    elements.filterEvent.addEventListener('change', () => {
        state.filters.event = elements.filterEvent.value;
        renderTable();
    });

    elements.filterDateFrom.addEventListener('change', () => {
        state.filters.dateFrom = elements.filterDateFrom.value;
        renderTable();
    });

    elements.filterDateTo.addEventListener('change', () => {
        state.filters.dateTo = elements.filterDateTo.value;
        renderTable();
    });

    elements.btnResetFilters.addEventListener('click', () => {
        elements.filterUser.value     = '';
        elements.filterEvent.value    = '';
        elements.filterDateFrom.value = '';
        elements.filterDateTo.value   = '';
        state.filters = { user: '', event: '', dateFrom: '', dateTo: '' };
        renderTable();
    });
}

async function init() {
    const ok = await checkSession();
    if (!ok) { window.location.href = '/login/'; return; }
    bindEvents();
    await fetchLogs();
}

init();
