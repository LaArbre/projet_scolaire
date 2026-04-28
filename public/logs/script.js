const state = {
    user: null,
    csrfToken: null,
    logs: [],
    totalLogs: 0,
    currentPage: 1,
    limit: 50,
    filterEvent: '',
    stats: { login: 0, fail: 0, consult: 0, logout: 0, total: 0 },
    pollingInterval: null
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
    cntTotal:        document.getElementById('cntTotal'),
    filterEvent:     document.getElementById('filterEvent'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    tableBody:       document.getElementById('tableBody'),
    tableCount:      document.getElementById('tableCount'),
    pageNum:         document.getElementById('pageNum'),
    pageTotal:       document.getElementById('pageTotal'),
    btnPrevPage:     document.getElementById('btnPrevPage'),
    btnNextPage:     document.getElementById('btnNextPage'),
    toastContainer:  document.getElementById('toastContainer')
};

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-msg">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Fermer">×</button>
    `;
    elements.toastContainer.appendChild(toast);
    const removeToast = () => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 200);
    };
    toast.querySelector('.toast-close').addEventListener('click', removeToast);
    setTimeout(removeToast, duration);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}

async function apiCall(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (state.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(options.method || 'GET')) {
        headers['X-CSRF-Token'] = state.csrfToken;
    }
    const response = await fetch(url, { credentials: 'include', ...options, headers });
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${response.status}`);
    }
    return response.json();
}

async function checkSession() {
    try {
        const data = await apiCall('/api/check-session');
        if (data.authenticated) {
            state.user = data.user;
            elements.topbarName.textContent = state.user.fullname || state.user.email;
            elements.topbarAvatar.textContent = (state.user.fullname || state.user.email).charAt(0).toUpperCase();
            const csrfData = await apiCall('/api/csrf-token');
            state.csrfToken = csrfData.csrfToken;
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

async function logout() {
    try {
        await apiCall('/api/logout', { method: 'POST' });
        window.location.href = '/login/';
    } catch {
        showToast('Erreur lors de la déconnexion', 'error');
    }
}

const EVENT_BADGE = {
    'Connexion réussie':       'badge-success',
    'Échec de connexion':      'badge-danger',
    'Consultation signalement':'badge-info',
    'Déconnexion':             'badge-muted'
};

function renderTable() {
    const tbody = elements.tableBody;
    if (state.logs.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="5">Aucun log trouvé</td></tr>`;
        elements.tableCount.textContent = '0 résultat';
        return;
    }

    let html = '';
    state.logs.forEach(log => {
        const badgeClass = EVENT_BADGE[log.name] || 'badge-muted';
        html += `
            <tr class="row-enter">
                <td class="date-cell">${escapeHtml(formatDate(log.date))}</td>
                <td><span class="event-badge ${badgeClass}">${escapeHtml(log.name)}</span></td>
                <td class="info-cell">${escapeHtml(log.info)}</td>
                <td class="user-cell">${escapeHtml(log.fullname)}</td>
                <td class="email-cell">${escapeHtml(log.email)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    elements.tableCount.textContent = `${state.totalLogs} résultat${state.totalLogs > 1 ? 's' : ''}`;
}

function updatePagination() {
    const totalPages = Math.ceil(state.totalLogs / state.limit) || 1;
    elements.pageNum.textContent = state.currentPage;
    elements.pageTotal.textContent = totalPages;
    elements.btnPrevPage.disabled = state.currentPage <= 1;
    elements.btnNextPage.disabled = state.currentPage >= totalPages;
}

async function fetchLogs() {
    try {
        const params = new URLSearchParams();
        params.append('limit', state.limit);
        params.append('offset', (state.currentPage - 1) * state.limit);
        if (state.filterEvent) params.append('name', state.filterEvent);

        const data = await apiCall(`/api/logs?${params.toString()}`);
        state.logs = data.logs || [];
        state.totalLogs = data.total || 0;
        renderTable();
        updatePagination();
    } catch (err) {
        showToast('Erreur lors du chargement des logs', 'error');
        state.logs = [];
        renderTable();
        updatePagination();
    }
}

async function fetchStats() {
    try {
        const data = await apiCall('/api/logs?limit=200');
        const all = data.logs || [];
        state.stats = { login: 0, fail: 0, consult: 0, logout: 0, total: data.total || 0 };
        all.forEach(l => {
            if (l.name === 'Connexion réussie')        state.stats.login++;
            else if (l.name === 'Échec de connexion')  state.stats.fail++;
            else if (l.name === 'Consultation signalement') state.stats.consult++;
            else if (l.name === 'Déconnexion')         state.stats.logout++;
        });
        elements.cntLogin.textContent   = state.stats.login;
        elements.cntFail.textContent    = state.stats.fail;
        elements.cntConsult.textContent = state.stats.consult;
        elements.cntLogout.textContent  = state.stats.logout;
        elements.cntTotal.textContent   = state.stats.total;
    } catch {
        // stats non-critiques
    }
}

function bindEvents() {
    elements.btnLogout.addEventListener('click', logout);

    elements.filterEvent.addEventListener('change', () => {
        state.filterEvent = elements.filterEvent.value;
        state.currentPage = 1;
        fetchLogs();
    });

    elements.btnResetFilters.addEventListener('click', () => {
        elements.filterEvent.value = '';
        state.filterEvent = '';
        state.currentPage = 1;
        fetchLogs();
    });

    elements.btnPrevPage.addEventListener('click', () => {
        if (state.currentPage > 1) { state.currentPage--; fetchLogs(); }
    });

    elements.btnNextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(state.totalLogs / state.limit);
        if (state.currentPage < totalPages) { state.currentPage++; fetchLogs(); }
    });

    state.pollingInterval = setInterval(fetchLogs, 30000);
}

async function init() {
    const ok = await checkSession();
    if (!ok) { window.location.href = '/login/'; return; }

    bindEvents();
    await fetchLogs();
    await fetchStats();

    elements.liveIndicator.style.display = 'flex';
}

window.addEventListener('beforeunload', () => {
    if (state.pollingInterval) clearInterval(state.pollingInterval);
});

init();
