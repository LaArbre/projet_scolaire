import { getSession, logout } from '../global/auth.js';
import { apiFetch } from '../global/utils.js';

// ─── State ────────────────────────────────────────────────────
let currentUser = null;
let allReports  = [];      // fetched from API
let filtered    = [];      // after client-side filters
let currentPage = 1;
const PAGE_SIZE = 20;

// Filters state
let filterState = {
    search:   '',
    category: '',
    dateFrom: '',
    dateTo:   '',
    anon:     '',
    view:     'open',      // 'open' | 'closed' | 'all'
    sort:     'created_at-desc',
};

// ─── DOM ──────────────────────────────────────────────────────
const tableBody     = document.getElementById('tableBody');
const tableCount    = document.getElementById('tableCount');
const pageNum       = document.getElementById('pageNum');
const pageTotal     = document.getElementById('pageTotal');
const btnPrevPage   = document.getElementById('btnPrevPage');
const btnNextPage   = document.getElementById('btnNextPage');
const detailDrawer  = document.getElementById('detailDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawerContent = document.getElementById('drawerContent');
const drawerTitle   = document.getElementById('drawerTitle');
const drawerClose   = document.getElementById('drawerClose');

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
    const session = await getSession();
    if (!session.authenticated) {
        window.location.href = '/login/';
        return;
    }
    currentUser = session.user;
    if (!['hr', 'legal', 'admin'].includes(currentUser.role)) {
        window.location.href = '/dashboard/';
        return;
    }

    renderUserBadge();
    bindFilters();
    bindDrawer();
    bindPagination();
    bindSort();
    document.getElementById('btnLogout').addEventListener('click', handleLogout);

    await fetchReports();

    // Auto-refresh every 60 s
    setInterval(fetchReports, 60_000);
}

// ─── User badge ───────────────────────────────────────────────
function renderUserBadge() {
    const name = currentUser.name || currentUser.email || 'Utilisateur';
    document.getElementById('topbarAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('topbarName').textContent   = name;
}

// ─── Fetch all reports ────────────────────────────────────────
async function fetchReports() {
    try {
        // Fetch up to 200 reports (adjust limit as needed)
        const data = await apiFetch('/api/reports?limit=200');
        allReports = data;
        applyFilters();
        updateStats();
    } catch (err) {
        console.error(err);
        showToast('Impossible de charger les signalements.', 'error');
    }
}

// ─── Stats ────────────────────────────────────────────────────
function updateStats() {
    const counts = { open: 0, in_progress: 0, waiting_info: 0, closed: 0 };
    for (const r of allReports) {
        if (r.status === 'open')              counts.open++;
        else if (r.status === 'in_progress')  counts.in_progress++;
        else if (r.status === 'waiting_info') counts.waiting_info++;
        else if (r.status.startsWith('closed')) counts.closed++;
    }
    document.getElementById('cntOpen').textContent     = counts.open;
    document.getElementById('cntProgress').textContent = counts.in_progress;
    document.getElementById('cntWaiting').textContent  = counts.waiting_info;
    document.getElementById('cntClosed').textContent   = counts.closed;
    document.getElementById('cntTotal').textContent    = allReports.length;
}

// ─── Filters binding ─────────────────────────────────────────
function bindFilters() {
    document.getElementById('filterSearch').addEventListener('input', debounce(e => {
        filterState.search = e.target.value.trim().toLowerCase();
        currentPage = 1;
        applyFilters();
    }, 250));

    document.getElementById('filterCategory').addEventListener('change', e => {
        filterState.category = e.target.value;
        currentPage = 1;
        applyFilters();
    });

    document.getElementById('filterDateFrom').addEventListener('change', e => {
        filterState.dateFrom = e.target.value;
        currentPage = 1;
        applyFilters();
    });

    document.getElementById('filterDateTo').addEventListener('change', e => {
        filterState.dateTo = e.target.value;
        currentPage = 1;
        applyFilters();
    });

    document.getElementById('filterAnon').addEventListener('change', e => {
        filterState.anon = e.target.value;
        currentPage = 1;
        applyFilters();
    });

    document.getElementById('btnResetFilters').addEventListener('click', resetFilters);

    // Toggle pill (open / closed / all)
    document.getElementById('toggleClosed').querySelectorAll('.pill-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterState.view = btn.dataset.val;
            currentPage = 1;
            applyFilters();
        });
    });
}

function resetFilters() {
    filterState = { ...filterState, search: '', category: '', dateFrom: '', dateTo: '', anon: '' };
    document.getElementById('filterSearch').value   = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value   = '';
    document.getElementById('filterAnon').value     = '';
    currentPage = 1;
    applyFilters();
}

// ─── Apply filters ────────────────────────────────────────────
function applyFilters() {
    let result = [...allReports];

    // View toggle
    if (filterState.view === 'open') {
        result = result.filter(r => !r.status.startsWith('closed'));
    } else if (filterState.view === 'closed') {
        result = result.filter(r => r.status.startsWith('closed'));
    }

    // Search: code, category, title
    if (filterState.search) {
        result = result.filter(r =>
            (r.tracking_code || '').toLowerCase().includes(filterState.search) ||
            (r.category || '').toLowerCase().includes(filterState.search) ||
            (r.title || '').toLowerCase().includes(filterState.search)
        );
    }

    // Category
    if (filterState.category) {
        result = result.filter(r => r.category === filterState.category);
    }

    // Date from
    if (filterState.dateFrom) {
        const from = new Date(filterState.dateFrom);
        result = result.filter(r => new Date(r.created_at) >= from);
    }

    // Date to (inclusive: end of day)
    if (filterState.dateTo) {
        const to = new Date(filterState.dateTo);
        to.setHours(23, 59, 59, 999);
        result = result.filter(r => new Date(r.created_at) <= to);
    }

    // Anonymat
    if (filterState.anon !== '') {
        const isAnon = filterState.anon === '1';
        result = result.filter(r => !!r.is_anonymous === isAnon);
    }

    // Sort
    const [sortField, sortDir] = filterState.sort.split('-');
    result.sort((a, b) => {
        let va = a[sortField] || '';
        let vb = b[sortField] || '';
        if (sortField === 'created_at' || sortField === 'updated_at') {
            va = new Date(va); vb = new Date(vb);
        } else {
            va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
        }
        if (va < vb) return sortDir === 'asc' ? -1 :  1;
        if (va > vb) return sortDir === 'asc' ?  1 : -1;
        return 0;
    });

    filtered = result;
    renderTable();
}

// ─── Render table ─────────────────────────────────────────────
function renderTable() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);

    const start = (currentPage - 1) * PAGE_SIZE;
    const slice = filtered.slice(start, start + PAGE_SIZE);

    tableCount.textContent = `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`;
    pageNum.textContent    = currentPage;
    pageTotal.textContent  = totalPages;
    btnPrevPage.disabled   = currentPage <= 1;
    btnNextPage.disabled   = currentPage >= totalPages;

    if (!slice.length) {
        tableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">
                    <span class="empty-icon">🔍</span>
                    Aucun signalement ne correspond aux filtres.
                </td>
            </tr>`;
        return;
    }

    tableBody.innerHTML = slice.map((r, i) => `
        <tr class="row-enter" style="animation-delay:${i * 0.03}s" data-id="${r.id}">
            <td class="code-cell">${escapeHtml(r.tracking_code || '—')}</td>
            <td class="category-cell">${escapeHtml(r.category || '—')}</td>
            <td><span class="status-badge status-${r.status}">${formatStatus(r.status)}</span></td>
            <td class="anon-badge">${r.is_anonymous ? '🙈 Oui' : '👤 Non'}</td>
            <td class="date-cell">${fmtDate(r.created_at)}</td>
            <td class="date-cell">${fmtDate(r.updated_at)}</td>
            <td>
                <button class="btn-row-action" data-id="${r.id}" title="Voir le détail">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            </td>
        </tr>
    `).join('');

    // Click row or button → open drawer
    tableBody.querySelectorAll('tr[data-id]').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.btn-row-action')) return; // handled below
            openDrawer(row.dataset.id);
        });
    });
    tableBody.querySelectorAll('.btn-row-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDrawer(btn.dataset.id);
        });
    });
}

// ─── Sort ─────────────────────────────────────────────────────
function bindSort() {
    document.getElementById('sortSelect').addEventListener('change', e => {
        filterState.sort = e.target.value;
        currentPage = 1;
        applyFilters();
    });
}

// ─── Pagination ───────────────────────────────────────────────
function bindPagination() {
    btnPrevPage.addEventListener('click', () => { currentPage--; renderTable(); });
    btnNextPage.addEventListener('click', () => { currentPage++; renderTable(); });
}

// ─── Drawer ───────────────────────────────────────────────────
function bindDrawer() {
    drawerClose.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
}

function openDrawer(reportId) {
    detailDrawer.classList.remove('hidden');
    drawerOverlay.classList.remove('hidden');
    drawerContent.innerHTML = '<div class="drawer-loading">Chargement…</div>';
    drawerTitle.textContent = 'Signalement';
    loadDrawerContent(reportId);
}

function closeDrawer() {
    detailDrawer.classList.add('hidden');
    drawerOverlay.classList.add('hidden');
}

async function loadDrawerContent(reportId) {
    try {
        const report = await apiFetch(`/api/reports/${reportId}`);
        drawerTitle.textContent = escapeHtml(report.category || 'Signalement');
        renderDrawer(report);
    } catch (err) {
        drawerContent.innerHTML = `<div class="drawer-loading" style="color:var(--danger)">Erreur de chargement.</div>`;
    }
}

function renderDrawer(report) {
    const canUpdate = ['hr', 'legal', 'admin'].includes(currentUser.role)
        && !report.status.startsWith('closed');

    const messagesHtml = report.messages?.length
        ? report.messages.map(m => {
            const isSystem = m.sender_role === 'system';
            const sender   = isSystem ? '⚙️ Système' : (m.is_anonymous ? 'Anonyme' : m.sender_role.toUpperCase());
            return `<div class="dw-message ${isSystem ? 'system-msg' : ''}">
                <div class="dw-msg-header">
                    <span class="dw-msg-sender">${escapeHtml(sender)}</span>
                    <span class="dw-msg-date">${fmtDatetime(m.created_at)}</span>
                </div>
                <div class="dw-msg-body">${escapeHtml(m.content)}</div>
            </div>`;
        }).join('')
        : '<div style="color:var(--text-muted);font-size:.85rem;padding:8px 0">Aucun message.</div>';

    const statusFormHtml = canUpdate ? `
        <div class="dw-section">
            <div class="dw-section-title">Changer le statut</div>
            <div class="dw-status-form" id="dwStatusForm">
                <select id="dwNewStatus">
                    <option value="in_progress">En cours</option>
                    <option value="waiting_info">En attente d'info</option>
                    <option value="closed_founded">Clôturer (fondé)</option>
                    <option value="closed_unfounded">Clôturer (non fondé)</option>
                </select>
                <input type="text" id="dwCloseReason" placeholder="Motif de clôture (requis si clôture)">
                <button class="btn-status-update" id="dwBtnStatus">Mettre à jour</button>
            </div>
        </div>` : '';

    drawerContent.innerHTML = `
        <!-- Meta grid -->
        <div class="dw-section">
            <div class="dw-meta-grid">
                <div class="dw-meta-item">
                    <div class="dw-meta-label">Code de suivi</div>
                    <div class="dw-meta-value"><span class="tracking-code">${escapeHtml(report.tracking_code)}</span></div>
                </div>
                <div class="dw-meta-item">
                    <div class="dw-meta-label">Statut</div>
                    <div class="dw-meta-value"><span class="status-badge status-${report.status}">${formatStatus(report.status)}</span></div>
                </div>
                <div class="dw-meta-item">
                    <div class="dw-meta-label">Créé le</div>
                    <div class="dw-meta-value">${fmtDatetime(report.created_at)}</div>
                </div>
                <div class="dw-meta-item">
                    <div class="dw-meta-label">Anonyme</div>
                    <div class="dw-meta-value">${report.is_anonymous ? '🙈 Oui' : '👤 Non'}</div>
                </div>
                ${report.closed_at ? `
                <div class="dw-meta-item">
                    <div class="dw-meta-label">Clôturé le</div>
                    <div class="dw-meta-value">${fmtDatetime(report.closed_at)}</div>
                </div>` : ''}
                ${report.close_reason ? `
                <div class="dw-meta-item" style="grid-column: 1/-1">
                    <div class="dw-meta-label">Motif de clôture</div>
                    <div class="dw-meta-value">${escapeHtml(report.close_reason)}</div>
                </div>` : ''}
            </div>
        </div>

        <!-- Description -->
        <div class="dw-section">
            <div class="dw-section-title">Description</div>
            <div class="dw-description">${escapeHtml(report.description)}</div>
        </div>

        <!-- Attachments -->
        ${report.attachments?.length ? `
        <div class="dw-section">
            <div class="dw-section-title">Pièces jointes (${report.attachments.length})</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${report.attachments.map(a => `
                    <a href="/api/attachments/${a.id}" download="${escapeHtml(a.filename)}"
                       style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:var(--radius-sm);color:var(--text-secondary);text-decoration:none;font-size:.8rem;transition:all var(--transition)"
                       onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                       onmouseout="this.style.borderColor='var(--border-strong)';this.style.color='var(--text-secondary)'">
                        📎 ${escapeHtml(a.filename)}
                    </a>`).join('')}
            </div>
        </div>` : ''}

        <!-- Status update -->
        ${statusFormHtml}

        <!-- Messages -->
        <div class="dw-section">
            <div class="dw-section-title">Conversation</div>
            <div class="dw-messages" id="dwMessages">${messagesHtml}</div>
            <div class="dw-reply-area">
                <textarea id="dwReplyText" placeholder="Répondre au signalement…"></textarea>
                <button class="btn-send-msg" id="dwBtnSend">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Envoyer
                </button>
            </div>
        </div>
    `;

    // Scroll messages to bottom
    const dwMsgs = document.getElementById('dwMessages');
    if (dwMsgs) dwMsgs.scrollTop = dwMsgs.scrollHeight;

    // Status update
    if (canUpdate) {
        document.getElementById('dwBtnStatus').addEventListener('click', () => updateStatus(report.id));
    }

    // Send message
    document.getElementById('dwBtnSend').addEventListener('click', () => sendMessage(report.id));
}

// ─── Update status ────────────────────────────────────────────
async function updateStatus(reportId) {
    const newStatus   = document.getElementById('dwNewStatus').value;
    const closeReason = document.getElementById('dwCloseReason').value.trim();

    if (newStatus.startsWith('closed') && !closeReason) {
        showToast('Un motif de clôture est requis.', 'warning');
        document.getElementById('dwCloseReason').focus();
        return;
    }

    try {
        const res = await apiFetch(`/api/reports/${reportId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus, close_reason: closeReason }),
            headers: { 'Content-Type': 'application/json' },
        });
        if (res.success) {
            showToast('Statut mis à jour.', 'success');
            await fetchReports();
            loadDrawerContent(reportId);
        } else {
            showToast('Erreur lors de la mise à jour.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Erreur réseau.', 'error');
    }
}

// ─── Send message ─────────────────────────────────────────────
async function sendMessage(reportId) {
    const textarea = document.getElementById('dwReplyText');
    const content  = textarea.value.trim();
    if (!content) { showToast('Le message est vide.', 'warning'); return; }

    const btn = document.getElementById('dwBtnSend');
    btn.disabled = true;
    try {
        const res = await apiFetch(`/api/reports/${reportId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, isAnonymous: false }),
            headers: { 'Content-Type': 'application/json' },
        });
        if (res.success) {
            showToast('Message envoyé.', 'success');
            loadDrawerContent(reportId);
        } else {
            showToast('Erreur envoi.', 'error');
            btn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        showToast('Erreur réseau.', 'error');
        btn.disabled = false;
    }
}

// ─── Logout ───────────────────────────────────────────────────
async function handleLogout() {
    await logout();
    window.location.href = '/login/';
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-msg">${escapeHtml(message)}</span>
        <button class="toast-close">✕</button>
    `;
    c.appendChild(t);
    const remove = () => {
        t.classList.add('toast-out');
        t.addEventListener('animationend', () => t.remove(), { once: true });
    };
    t.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, 4000);
}

// ─── Helpers ──────────────────────────────────────────────────
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m]);
}

function formatStatus(s) {
    return { open:'Ouvert', in_progress:'En cours', waiting_info:'Attente info',
        closed_founded:'Clôturé fondé', closed_unfounded:'Clôturé non fondé' }[s] || s;
}

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
}

function fmtDatetime(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString('fr-FR');
}

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
