// ============================================================
// GESTION DE L'ÉTAT GLOBAL
// ============================================================
const state = {
    user: null,
    csrfToken: null,
    reports: [],
    totalReports: 0,
    currentPage: 1,
    limit: 20,
    filters: {
        search: '',
        category: '',
        dateFrom: '',
        dateTo: '',
        isAnonymous: '',
        closed: 'open' // 'open', 'closed', 'all'
    },
    sort: 'created_at-desc',
    stats: {
        open: 0,
        in_progress: 0,
        waiting_info: 0,
        closed: 0,
        total: 0
    },
    drawerReportId: null,
    drawerMessages: [],
    pollingInterval: null
};

// Éléments DOM fréquemment utilisés
const elements = {
    // Topbar
    topbarAvatar: document.getElementById('topbarAvatar'),
    topbarName: document.getElementById('topbarName'),
    btnLogout: document.getElementById('btnLogout'),
    liveIndicator: document.getElementById('liveIndicator'),

    // Stats
    cntOpen: document.getElementById('cntOpen'),
    cntProgress: document.getElementById('cntProgress'),
    cntWaiting: document.getElementById('cntWaiting'),
    cntClosed: document.getElementById('cntClosed'),
    cntTotal: document.getElementById('cntTotal'),

    // Filtres
    filterSearch: document.getElementById('filterSearch'),
    filterCategory: document.getElementById('filterCategory'),
    filterDateFrom: document.getElementById('filterDateFrom'),
    filterDateTo: document.getElementById('filterDateTo'),
    filterAnon: document.getElementById('filterAnon'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    toggleClosed: document.getElementById('toggleClosed'),
    sortSelect: document.getElementById('sortSelect'),

    // Table
    tableBody: document.getElementById('tableBody'),
    tableCount: document.getElementById('tableCount'),
    pageNum: document.getElementById('pageNum'),
    pageTotal: document.getElementById('pageTotal'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),

    // Drawer
    drawerOverlay: document.getElementById('drawerOverlay'),
    detailDrawer: document.getElementById('detailDrawer'),
    drawerClose: document.getElementById('drawerClose'),
    drawerTitle: document.getElementById('drawerTitle'),
    drawerContent: document.getElementById('drawerContent'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ============================================================
// UTILITAIRES
// ============================================================

// Toast
function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : type === 'warning' ? '⚠' : 'ℹ';
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-msg">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Fermer">×</button>
    `;
    elements.toastContainer.appendChild(toast);
    
    const closeBtn = toast.querySelector('.toast-close');
    const removeToast = () => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 200);
    };
    closeBtn.addEventListener('click', removeToast);
    setTimeout(removeToast, duration);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Formatage de date relative
function formatRelativeDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffSec < 60) return "à l'instant";
    if (diffMin < 60) return `il y a ${diffMin} min`;
    if (diffHour < 24) return `il y a ${diffHour} h`;
    if (diffDay < 30) return `il y a ${diffDay} j`;
    if (diffMonth < 12) return `il y a ${diffMonth} mois`;
    return `il y a ${diffYear} an${diffYear > 1 ? 's' : ''}`;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

// Debounce pour la recherche
function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// ============================================================
// API CALLS (avec gestion CSRF et erreurs)
// ============================================================
async function apiCall(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    if (state.csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(options.method || 'GET')) {
        headers['X-CSRF-Token'] = state.csrfToken;
    }
    const config = {
        credentials: 'include',
        ...options,
        headers
    };
    try {
        const response = await fetch(url, config);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erreur ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Vérification de session et récupération CSRF
async function checkSession() {
    try {
        const data = await apiCall('/api/check-session');
        if (data.authenticated) {
            state.user = data.user;
            updateUserUI();
            // Récupérer le token CSRF
            const csrfData = await apiCall('/api/csrf-token');
            state.csrfToken = csrfData.csrfToken;
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

async function logout() {
    try {
        await apiCall('/api/logout', { method: 'POST' });
        window.location.href = '/login.html'; // redirection vers login
    } catch (error) {
        showToast('Erreur lors de la déconnexion', 'error');
    }
}

// Récupération des signalements avec filtres
async function fetchReports() {
    try {
        const params = new URLSearchParams();
        params.append('limit', state.limit);
        params.append('offset', (state.currentPage - 1) * state.limit);
        
        // Filtres
        if (state.filters.category) params.append('category', state.filters.category);
        if (state.filters.dateFrom) params.append('created_after', state.filters.dateFrom);
        if (state.filters.dateTo) params.append('created_before', state.filters.dateTo);
        if (state.filters.isAnonymous !== '') params.append('is_anonymous', state.filters.isAnonymous);
        if (state.filters.search) params.append('search', state.filters.search); // L'API ne supporte pas search, on filtrera côté client
        
        // Statut (closed filter)
        if (state.filters.closed === 'open') {
            // L'API ne supporte pas directement "status not like closed%", on va filtrer côté client
        } else if (state.filters.closed === 'closed') {
            // On pourrait ajouter un paramètre fictif mais l'API ne le gère pas. On filtrera côté client.
        }
        
        // Tri
        const [sortField, sortOrder] = state.sort.split('-');
        // L'API ne supporte pas le tri via query string, on triera côté client

        const data = await apiCall(`/api/reports?${params.toString()}`);
        
        let reports = data.reports || [];
        state.totalReports = data.total || 0;
        
        // Appliquer les filtres supplémentaires côté client (search, closed, tri)
        reports = filterReportsClientSide(reports);
        reports = sortReportsClientSide(reports);
        
        state.reports = reports;
        renderTable();
        updatePagination();
        
        // Mettre à jour les stats (on peut le faire avec un appel séparé pour plus de précision)
        await fetchStats();
        
    } catch (error) {
        showToast('Erreur lors du chargement des signalements', 'error');
        console.error(error);
        state.reports = [];
        renderTable();
        updatePagination();
    }
}

// Filtrage côté client pour search et closed
function filterReportsClientSide(reports) {
    return reports.filter(report => {
        // Filtre search (code ou catégorie)
        if (state.filters.search) {
            const searchTerm = state.filters.search.toLowerCase();
            const codeMatch = report.tracking_code?.toLowerCase().includes(searchTerm);
            const catMatch = report.category?.toLowerCase().includes(searchTerm);
            if (!codeMatch && !catMatch) return false;
        }
        
        // Filtre closed
        if (state.filters.closed === 'open' && report.status?.startsWith('closed')) return false;
        if (state.filters.closed === 'closed' && !report.status?.startsWith('closed')) return false;
        
        return true;
    });
}

function sortReportsClientSide(reports) {
    const [field, order] = state.sort.split('-');
    return [...reports].sort((a, b) => {
        let valA = a[field];
        let valB = b[field];
        if (field === 'created_at' || field === 'updated_at') {
            valA = new Date(valA);
            valB = new Date(valB);
        }
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });
}

// Récupération des statistiques (en faisant un appel avec grande limite pour les rôles admin/hr/legal)
async function fetchStats() {
    if (!state.user) return;
    try {
        let statsUrl = '/api/reports?limit=1000';
        // Si employé, l'API ne retourne que ses signalements, donc les stats sont correctes pour lui
        const data = await apiCall(statsUrl);
        const reports = data.reports || [];
        
        const stats = {
            open: 0,
            in_progress: 0,
            waiting_info: 0,
            closed: 0,
            total: data.total || reports.length
        };
        
        reports.forEach(r => {
            if (r.status === 'open') stats.open++;
            else if (r.status === 'in_progress') stats.in_progress++;
            else if (r.status === 'waiting_info') stats.waiting_info++;
            else if (r.status.startsWith('closed')) stats.closed++;
        });
        
        state.stats = stats;
        updateStatsUI();
    } catch (error) {
        console.error('Erreur stats:', error);
    }
}

// ============================================================
// RENDU UI
// ============================================================
function updateUserUI() {
    if (state.user) {
        elements.topbarName.textContent = state.user.fullname || state.user.email;
        const initial = (state.user.fullname || state.user.email).charAt(0).toUpperCase();
        elements.topbarAvatar.textContent = initial;
    }
}

function updateStatsUI() {
    elements.cntOpen.textContent = state.stats.open;
    elements.cntProgress.textContent = state.stats.in_progress;
    elements.cntWaiting.textContent = state.stats.waiting_info;
    elements.cntClosed.textContent = state.stats.closed;
    elements.cntTotal.textContent = state.stats.total;
}

function renderTable() {
    const tbody = elements.tableBody;
    if (state.reports.length === 0) {
        tbody.innerHTML = `<tr class="empty-row"><td colspan="7"><span class="empty-icon">📋</span>Aucun signalement trouvé</td></tr>`;
        elements.tableCount.textContent = `0 résultat`;
        return;
    }
    
    let html = '';
    state.reports.forEach(report => {
        const statusClass = `status-${report.status}`;
        const statusLabel = {
            open: 'Ouvert',
            in_progress: 'En cours',
            waiting_info: 'Attente info',
            closed_founded: 'Clôturé fondé',
            closed_unfounded: 'Clôturé non fondé'
        }[report.status] || report.status;
        
        html += `
            <tr class="row-enter" data-report-id="${report.id}">
                <td class="code-cell">${escapeHtml(report.tracking_code)}</td>
                <td class="category-cell">${escapeHtml(report.category)}</td>
                <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
                <td class="anon-badge">${report.is_anonymous ? '👤 Anonyme' : 'Identifié'}</td>
                <td class="date-cell" title="${formatDate(report.created_at)}">${formatRelativeDate(report.created_at)}</td>
                <td class="date-cell" title="${formatDate(report.updated_at)}">${formatRelativeDate(report.updated_at)}</td>
                <td><button class="btn-row-action" data-action="view" data-id="${report.id}" title="Voir détails">👁️</button></td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
    elements.tableCount.textContent = `${state.reports.length} résultat${state.reports.length > 1 ? 's' : ''} (total ${state.totalReports})`;
    
    // Attacher les événements sur les lignes et boutons
    tbody.querySelectorAll('tr[data-report-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('button')) return; // ne pas ouvrir si clic sur bouton
            const id = row.dataset.reportId;
            openDrawer(id);
        });
    });
    tbody.querySelectorAll('.btn-row-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            openDrawer(id);
        });
    });
}

function updatePagination() {
    const totalPages = Math.ceil(state.totalReports / state.limit) || 1;
    elements.pageNum.textContent = state.currentPage;
    elements.pageTotal.textContent = totalPages;
    elements.btnPrevPage.disabled = state.currentPage <= 1;
    elements.btnNextPage.disabled = state.currentPage >= totalPages;
}

// ============================================================
// GESTION DU DRAWER
// ============================================================
async function openDrawer(reportId) {
    state.drawerReportId = reportId;
    elements.drawerOverlay.classList.remove('hidden');
    elements.detailDrawer.classList.remove('hidden');
    elements.drawerContent.innerHTML = '<div class="drawer-loading">Chargement...</div>';
    
    try {
        // Récupérer les détails du signalement
        const report = await apiCall(`/api/reports/${reportId}`);
        // Récupérer les messages
        const messagesData = await apiCall(`/api/reports/${reportId}/messages?limit=50`);
        state.drawerMessages = messagesData.messages || [];
        
        renderDrawerContent(report, state.drawerMessages);
    } catch (error) {
        showToast('Erreur lors du chargement des détails', 'error');
        closeDrawer();
    }
}

function renderDrawerContent(report, messages) {
    const statusLabel = {
        open: 'Ouvert',
        in_progress: 'En cours',
        waiting_info: 'Attente info',
        closed_founded: 'Clôturé (fondé)',
        closed_unfounded: 'Clôturé (non fondé)'
    }[report.status] || report.status;
    
    const isClosed = report.status.startsWith('closed');
    const canChangeStatus = ['hr', 'legal', 'admin'].includes(state.user?.role) && !isClosed;
    
    let attachmentsHtml = '';
    if (report.attachments && report.attachments.length > 0) {
        attachmentsHtml = `
            <div class="dw-section">
                <div class="dw-section-title">Pièces jointes</div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    ${report.attachments.map(att => `
                        <a href="/api/attachments/${att.id}" target="_blank" style="color:var(--accent); text-decoration:none; font-size:0.85rem;">
                            📎 ${escapeHtml(att.filename)} (${(att.filesize/1024).toFixed(1)} Ko)
                        </a>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    let messagesHtml = '';
    if (messages.length > 0) {
        messagesHtml = messages.map(msg => `
            <div class="dw-message ${msg.sender_role === 'system' ? 'system-msg' : ''}">
                <div class="dw-msg-header">
                    <span class="dw-msg-sender">${msg.is_anonymous ? 'Anonyme' : (msg.sender_role === 'system' ? 'Système' : (msg.sender_id ? 'Utilisateur' : 'Inconnu'))}</span>
                    <span class="dw-msg-date">${formatRelativeDate(msg.created_at)}</span>
                </div>
                <div class="dw-msg-body">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>
            </div>
        `).join('');
    } else {
        messagesHtml = '<div style="color:var(--text-muted); text-align:center; padding:12px;">Aucun message</div>';
    }
    
    let statusFormHtml = '';
    if (canChangeStatus) {
        statusFormHtml = `
            <div class="dw-section">
                <div class="dw-section-title">Changer le statut</div>
                <div class="dw-status-form">
                    <select id="dwStatusSelect">
                        <option value="open" ${report.status === 'open' ? 'selected' : ''}>Ouvert</option>
                        <option value="in_progress" ${report.status === 'in_progress' ? 'selected' : ''}>En cours</option>
                        <option value="waiting_info" ${report.status === 'waiting_info' ? 'selected' : ''}>Attente info</option>
                        <option value="closed_founded" ${report.status === 'closed_founded' ? 'selected' : ''}>Clôturé fondé</option>
                        <option value="closed_unfounded" ${report.status === 'closed_unfounded' ? 'selected' : ''}>Clôturé non fondé</option>
                    </select>
                    <input type="text" id="dwCloseReason" placeholder="Motif (si clôture)" style="${report.status.startsWith('closed') ? '' : 'display:none;'}">
                    <button class="btn-status-update" id="dwUpdateStatusBtn">Mettre à jour</button>
                </div>
            </div>
        `;
    }
    
    let replyFormHtml = '';
    if (!isClosed) {
        replyFormHtml = `
            <div class="dw-section">
                <div class="dw-section-title">Répondre</div>
                <div class="dw-reply-area">
                    <textarea id="dwReplyText" placeholder="Votre message..."></textarea>
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color:var(--text-muted);">
                        <input type="checkbox" id="dwReplyAnon"> Anonyme
                    </label>
                    <button class="btn-send-msg" id="dwSendMsgBtn">Envoyer</button>
                </div>
            </div>
        `;
    }
    
    elements.drawerTitle.textContent = `Signalement ${report.tracking_code}`;
    elements.drawerContent.innerHTML = `
        <div class="dw-section">
            <div class="tracking-code">${escapeHtml(report.tracking_code)}</div>
        </div>
        <div class="dw-section">
            <div class="dw-section-title">Informations</div>
            <div class="dw-meta-grid">
                <div class="dw-meta-item"><div class="dw-meta-label">Statut</div><div class="dw-meta-value">${statusLabel}</div></div>
                <div class="dw-meta-item"><div class="dw-meta-label">Catégorie</div><div class="dw-meta-value">${escapeHtml(report.category)}</div></div>
                <div class="dw-meta-item"><div class="dw-meta-label">Créé le</div><div class="dw-meta-value">${formatDate(report.created_at)}</div></div>
                <div class="dw-meta-item"><div class="dw-meta-label">Anonyme</div><div class="dw-meta-value">${report.is_anonymous ? 'Oui' : 'Non'}</div></div>
            </div>
        </div>
        <div class="dw-section">
            <div class="dw-section-title">Description</div>
            <div class="dw-description">${escapeHtml(report.description).replace(/\n/g, '<br>')}</div>
        </div>
        ${attachmentsHtml}
        ${statusFormHtml}
        <div class="dw-section">
            <div class="dw-section-title">Messages (${messages.length})</div>
            <div class="dw-messages" id="dwMessagesContainer">${messagesHtml}</div>
        </div>
        ${replyFormHtml}
    `;
    
    // Attacher les événements du drawer
    if (canChangeStatus) {
        const statusSelect = document.getElementById('dwStatusSelect');
        const reasonInput = document.getElementById('dwCloseReason');
        statusSelect.addEventListener('change', () => {
            if (statusSelect.value.startsWith('closed')) {
                reasonInput.style.display = 'block';
            } else {
                reasonInput.style.display = 'none';
            }
        });
        document.getElementById('dwUpdateStatusBtn').addEventListener('click', () => updateReportStatus(report.id));
    }
    if (!isClosed) {
        document.getElementById('dwSendMsgBtn').addEventListener('click', () => sendMessage(report.id));
    }
}

async function updateReportStatus(reportId) {
    const statusSelect = document.getElementById('dwStatusSelect');
    const reasonInput = document.getElementById('dwCloseReason');
    const newStatus = statusSelect.value;
    const closeReason = newStatus.startsWith('closed') ? reasonInput.value.trim() : undefined;
    
    if (newStatus.startsWith('closed') && !closeReason) {
        showToast('Le motif de clôture est obligatoire', 'warning');
        return;
    }
    
    try {
        await apiCall(`/api/reports/${reportId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus, close_reason: closeReason })
        });
        showToast('Statut mis à jour', 'success');
        closeDrawer();
        fetchReports(); // Rafraîchir la liste
    } catch (error) {
        showToast(error.message || 'Erreur lors de la mise à jour', 'error');
    }
}

async function sendMessage(reportId) {
    const textarea = document.getElementById('dwReplyText');
    const anonCheck = document.getElementById('dwReplyAnon');
    const content = textarea.value.trim();
    if (!content) {
        showToast('Le message ne peut pas être vide', 'warning');
        return;
    }
    
    try {
        await apiCall(`/api/reports/${reportId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, isAnonymous: anonCheck.checked })
        });
        showToast('Message envoyé', 'success');
        // Recharger les messages
        const messagesData = await apiCall(`/api/reports/${reportId}/messages?limit=50`);
        state.drawerMessages = messagesData.messages || [];
        // Mettre à jour la section messages dans le drawer
        const container = document.getElementById('dwMessagesContainer');
        if (container) {
            let html = '';
            state.drawerMessages.forEach(msg => {
                html += `
                    <div class="dw-message ${msg.sender_role === 'system' ? 'system-msg' : ''}">
                        <div class="dw-msg-header">
                            <span class="dw-msg-sender">${msg.is_anonymous ? 'Anonyme' : (msg.sender_role === 'system' ? 'Système' : 'Utilisateur')}</span>
                            <span class="dw-msg-date">${formatRelativeDate(msg.created_at)}</span>
                        </div>
                        <div class="dw-msg-body">${escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>
                    </div>
                `;
            });
            container.innerHTML = html || '<div style="color:var(--text-muted); text-align:center; padding:12px;">Aucun message</div>';
            textarea.value = '';
        }
    } catch (error) {
        showToast(error.message || 'Erreur lors de l\'envoi', 'error');
    }
}

function closeDrawer() {
    elements.drawerOverlay.classList.add('hidden');
    elements.detailDrawer.classList.add('hidden');
    state.drawerReportId = null;
    state.drawerMessages = [];
}

// ============================================================
// GESTION DES ÉVÉNEMENTS
// ============================================================
function bindEvents() {
    // Logout
    elements.btnLogout.addEventListener('click', logout);
    
    // Filtres
    elements.filterSearch.addEventListener('input', debounce(() => {
        state.filters.search = elements.filterSearch.value;
        state.currentPage = 1;
        fetchReports();
    }, 300));
    
    elements.filterCategory.addEventListener('change', () => {
        state.filters.category = elements.filterCategory.value;
        state.currentPage = 1;
        fetchReports();
    });
    
    elements.filterDateFrom.addEventListener('change', () => {
        state.filters.dateFrom = elements.filterDateFrom.value;
        state.currentPage = 1;
        fetchReports();
    });
    
    elements.filterDateTo.addEventListener('change', () => {
        state.filters.dateTo = elements.filterDateTo.value;
        state.currentPage = 1;
        fetchReports();
    });
    
    elements.filterAnon.addEventListener('change', () => {
        state.filters.isAnonymous = elements.filterAnon.value;
        state.currentPage = 1;
        fetchReports();
    });
    
    elements.btnResetFilters.addEventListener('click', () => {
        elements.filterSearch.value = '';
        elements.filterCategory.value = '';
        elements.filterDateFrom.value = '';
        elements.filterDateTo.value = '';
        elements.filterAnon.value = '';
        state.filters = { search: '', category: '', dateFrom: '', dateTo: '', isAnonymous: '', closed: 'open' };
        document.querySelectorAll('.pill-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector('.pill-btn[data-val="open"]').classList.add('active');
        state.sort = 'created_at-desc';
        elements.sortSelect.value = 'created_at-desc';
        state.currentPage = 1;
        fetchReports();
    });
    
    // Toggle closed
    elements.toggleClosed.querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            elements.toggleClosed.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filters.closed = btn.dataset.val;
            state.currentPage = 1;
            fetchReports();
        });
    });
    
    // Tri
    elements.sortSelect.addEventListener('change', () => {
        state.sort = elements.sortSelect.value;
        state.currentPage = 1;
        fetchReports();
    });
    
    // Pagination
    elements.btnPrevPage.addEventListener('click', () => {
        if (state.currentPage > 1) {
            state.currentPage--;
            fetchReports();
        }
    });
    
    elements.btnNextPage.addEventListener('click', () => {
        const totalPages = Math.ceil(state.totalReports / state.limit);
        if (state.currentPage < totalPages) {
            state.currentPage++;
            fetchReports();
        }
    });
    
    // Drawer
    elements.drawerClose.addEventListener('click', closeDrawer);
    elements.drawerOverlay.addEventListener('click', closeDrawer);
    
    // Live polling (toutes les 30 secondes)
    state.pollingInterval = setInterval(() => {
        if (!state.drawerReportId) {
            fetchReports();
        }
    }, 30000);
}

// ============================================================
// INITIALISATION
// ============================================================
async function init() {
    const isAuthenticated = await checkSession();
    if (!isAuthenticated) {
        window.location.href = '/login.html';
        return;
    }
    
    bindEvents();
    await fetchReports();
    
    // Afficher l'indicateur "En direct"
    elements.liveIndicator.style.display = 'flex';
}

// Nettoyage au déchargement
window.addEventListener('beforeunload', () => {
    if (state.pollingInterval) clearInterval(state.pollingInterval);
});

// Démarrer
init();