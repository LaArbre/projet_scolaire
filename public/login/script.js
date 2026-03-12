import { getSession, logout }    from '../global/auth.js';
import { apiFetch, getCsrfToken, escapeHtml, formatDate, formatDateTime,
         STATUS_LABELS, ROLE_LABELS } from '../global/utils.js';

// ── État global ───────────────────────────────────────────────────────────────
let currentUser   = null;
let currentReport = null;
let myReports     = [];
let currentMessages = { items: [], hasBefore: false, hasAfter: false };

// ── DOM ───────────────────────────────────────────────────────────────────────
const sidebarNav   = document.getElementById('sidebarNav');
const reportsList  = document.getElementById('reportsList');
const mainContent  = document.getElementById('mainContent');
const userAvatar   = document.getElementById('userAvatar');
const userName     = document.getElementById('userName');
const userRole     = document.getElementById('userRole');
const btnLogout    = document.getElementById('btnLogout');
const modalOverlay = document.getElementById('modalOverlay');
const modal        = document.getElementById('modal');
const modalTitle   = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const modalCancel  = document.getElementById('modalCancel');
const modalConfirm = document.getElementById('modalConfirm');

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const session = await getSession();
    if (!session.authenticated) {
        window.location.href = '/login/';
        return;
    }
    currentUser = session.user;

    // Affichage utilisateur
    const initials = currentUser.fullname.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    userAvatar.textContent  = initials;
    userName.textContent    = currentUser.fullname;
    userRole.textContent    = ROLE_LABELS[currentUser.role] || currentUser.role;

    renderSidebarNav();
    await loadMyReports();
    setupListeners();
});

function setupListeners() {
    document.getElementById('btnNewReport')?.addEventListener('click', showNewReportForm);
    document.getElementById('btnNewReportWelcome')?.addEventListener('click', showNewReportForm);
    btnLogout.addEventListener('click', () => {
        showModal('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter ?', async () => {
            await logout();
            window.location.href = '/login/';
        });
    });
    modalCancel.addEventListener('click',  () => closeModal());
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
}

// ── Modal générique ───────────────────────────────────────────────────────────
function showModal(title, message, onConfirm, dangerLabel = 'Confirmer') {
    modalTitle.textContent   = title;
    modalMessage.textContent = message;
    modalConfirm.textContent = dangerLabel;
    modalOverlay.classList.remove('hidden');
    modalConfirm.onclick = () => { closeModal(); onConfirm(); };
}
function closeModal() { modalOverlay.classList.add('hidden'); }

// ── Sidebar nav ───────────────────────────────────────────────────────────────
function renderSidebarNav() {
    let html = '';
    if (['hr', 'legal', 'admin'].includes(currentUser.role)) {
        html += navLink('manage', '📂', 'Gestion des signalements');
    }
    if (['legal', 'admin'].includes(currentUser.role)) {
        html += navLink('audit', '📜', "Journal d'audit");
    }
    if (currentUser.role === 'admin') {
        html += navLink('users', '👥', 'Utilisateurs');
    }
    sidebarNav.innerHTML = html;

    sidebarNav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            sidebarNav.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            navigateTo(link.dataset.page);
        });
    });
}

function navLink(page, icon, label) {
    return `<button class="nav-link" data-page="${page}">${icon} ${label}</button>`;
}

// ── Chargement signalements sidebar ──────────────────────────────────────────
async function loadMyReports() {
    try {
        myReports = await apiFetch('/api/reports?limit=50');
        renderReportsList();
    } catch (err) {
        console.error('Erreur chargement signalements:', err);
    }
}

function renderReportsList() {
    if (!myReports.length) {
        reportsList.innerHTML = '<li class="report-item-empty">Aucun signalement</li>';
        return;
    }
    reportsList.innerHTML = myReports.map(r => `
        <li class="report-item ${currentReport?.id === r.id ? 'active' : ''}"
            data-id="${r.id}">
            <div class="report-item-title">${escapeHtml(r.title)}</div>
            <div class="report-item-meta">
                ${statusBadge(r.status)}
                <span style="font-size:11px;color:var(--text-3)">${formatDate(r.created_at)}</span>
            </div>
        </li>
    `).join('');

    reportsList.querySelectorAll('.report-item').forEach(item => {
        item.addEventListener('click', () => showReportDetail(parseInt(item.dataset.id)));
    });
}

// ── Badges ────────────────────────────────────────────────────────────────────
function statusBadge(status) {
    return `<span class="badge badge-${status}">${STATUS_LABELS[status] || status}</span>`;
}

// ── Navigation pages ──────────────────────────────────────────────────────────
function navigateTo(page) {
    currentReport = null;
    renderReportsList();
    if (page === 'manage') showManagePage();
    else if (page === 'audit')  showAuditPage();
    else if (page === 'users')  showUsersPage();
}

// ═════════════════════════════════════════════════════════════════════════════
//  NOUVEAU SIGNALEMENT
// ═════════════════════════════════════════════════════════════════════════════
function showNewReportForm() {
    sidebarNav.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    mainContent.innerHTML = `
        <div class="form-container">
            <h2 class="form-title">Nouveau signalement</h2>
            <div class="form-group">
                <label for="rTitle">Titre *</label>
                <input class="form-control" id="rTitle" type="text" maxlength="255"
                       placeholder="Résumé court du signalement">
            </div>
            <div class="form-group">
                <label for="rCategory">Catégorie *</label>
                <select class="form-control" id="rCategory">
                    <option value="">Choisissez…</option>
                    <option>Harcèlement moral</option>
                    <option>Harcèlement sexuel</option>
                    <option>Discrimination</option>
                    <option>Conflit hiérarchique</option>
                    <option>Atteinte à l'éthique</option>
                    <option>Autre</option>
                </select>
            </div>
            <div class="form-group">
                <label for="rDesc">Description *</label>
                <textarea class="form-control" id="rDesc" maxlength="10000"
                          placeholder="Décrivez les faits de manière détaillée…"></textarea>
            </div>
            <div class="form-group">
                <label class="checkbox-row">
                    <input type="checkbox" id="rAnon">
                    Rester anonyme
                </label>
            </div>
            <div class="form-group">
                <label for="rFiles">Pièces jointes (PDF, images, TXT — 10 Mo max, 5 fichiers)</label>
                <input class="form-control" id="rFiles" type="file" multiple
                       accept=".pdf,.jpg,.jpeg,.png,.gif,.txt">
            </div>
            <div class="form-actions">
                <button class="btn-ghost" id="cancelForm">Annuler</button>
                <button class="btn-primary" id="submitForm">Envoyer le signalement</button>
            </div>
        </div>
    `;
    document.getElementById('cancelForm').addEventListener('click', showWelcome);
    document.getElementById('submitForm').addEventListener('click', submitNewReport);
}

async function submitNewReport() {
    const btn = document.getElementById('submitForm');
    const title    = document.getElementById('rTitle').value.trim();
    const category = document.getElementById('rCategory').value;
    const desc     = document.getElementById('rDesc').value.trim();
    const anon     = document.getElementById('rAnon').checked;
    const files    = document.getElementById('rFiles').files;

    if (!title || !category || !desc) {
        alert('Veuillez remplir tous les champs obligatoires.');
        return;
    }

    btn.disabled   = true;
    btn.innerHTML  = '<span class="loader"></span> Envoi…';

    try {
        const fd = new FormData();
        fd.append('title',        title);
        fd.append('category',     category);
        fd.append('description',  desc);
        fd.append('is_anonymous', anon ? '1' : '0');
        for (const f of files) fd.append('attachments', f);

        const token = await getCsrfToken();
        const res   = await fetch('/api/reports', {
            method:      'POST',
            credentials: 'include',
            headers:     { 'X-CSRF-Token': token },
            body:        fd,
        });
        const data = await res.json();
        if (data.success) {
            await loadMyReports();
            showReportDetail(data.report_id);
        } else {
            alert(data.error || 'Erreur lors de la création');
        }
    } catch (err) {
        console.error(err);
        alert('Erreur réseau');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = 'Envoyer le signalement';
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  DÉTAIL D'UN SIGNALEMENT
// ═════════════════════════════════════════════════════════════════════════════
async function showReportDetail(reportId) {
    mainContent.innerHTML = `<div class="empty-state"><span class="loader"></span></div>`;
    try {
        const [report, msgData] = await Promise.all([
            apiFetch(`/api/reports/${reportId}`),
            apiFetch(`/api/reports/${reportId}/messages?limit=20`),
        ]);
        currentReport    = report;
        currentMessages  = { items: msgData.messages, hasBefore: msgData.hasBefore, hasAfter: msgData.hasAfter };
        renderReportDetail();
        renderReportsList();
    } catch (err) {
        console.error(err);
        mainContent.innerHTML = `<div class="empty-state"><p>Erreur lors du chargement.</p></div>`;
    }
}

function renderReportDetail() {
    const r      = currentReport;
    const isClosed = r.status.startsWith('closed');
    const canEdit  = ['hr', 'legal', 'admin'].includes(currentUser.role) && !isClosed;

    // Pièces jointes
    let attachHtml = '';
    if (r.attachments?.length) {
        const items = r.attachments.map(a => `
            <li><a class="attachment-chip" href="/api/attachments/${a.id}"
               download="${escapeHtml(a.filename)}">📎 ${escapeHtml(a.filename)}</a></li>
        `).join('');
        attachHtml = `
            <div class="report-section">
                <div class="report-section-title">Pièces jointes</div>
                <ul class="attachments-list">${items}</ul>
            </div>
        `;
    }

    // Messages
    const msgsHtml = buildMessagesHtml();

    // Actions statut
    let statusHtml = '';
    if (canEdit) {
        statusHtml = `
            <div class="status-actions">
                <div class="form-group">
                    <label>Nouveau statut</label>
                    <select class="form-control" id="selectStatus">
                        <option value="in_progress">En cours</option>
                        <option value="waiting_info">En attente d'info</option>
                        <option value="closed_founded">Clôturer (fondé)</option>
                        <option value="closed_unfounded">Clôturer (non fondé)</option>
                    </select>
                </div>
                <div class="form-group" style="flex:2">
                    <label>Motif (obligatoire si clôture)</label>
                    <input class="form-control" id="closeReason" type="text"
                           placeholder="Motif de clôture…">
                </div>
                <button class="btn-primary btn-sm" id="btnUpdateStatus">Mettre à jour</button>
            </div>
        `;
    }

    mainContent.innerHTML = `
        <div class="report-detail">
            <div class="report-banner">
                <div class="report-banner-top">
                    <h1 class="report-banner-title">${escapeHtml(r.title)}</h1>
                    <div>
                        <span class="badge ${r.is_anonymous ? 'badge-anon' : 'badge-ident'}">
                            ${r.is_anonymous ? 'Anonyme' : 'Identifié'}
                        </span>
                    </div>
                </div>
                <div class="report-banner-meta">
                    ${statusBadge(r.status)}
                    <span class="badge" style="background:var(--surface-2);color:var(--text-2);border:1px solid var(--border)">
                        ${escapeHtml(r.category)}
                    </span>
                    <span class="tracking-code">${escapeHtml(r.tracking_code)}</span>
                    <span style="font-size:12px;color:var(--text-3)">
                        Créé le ${formatDateTime(r.created_at)}
                    </span>
                </div>
            </div>

            <div class="report-section">
                <div class="report-section-title">Description</div>
                <p class="report-description-text">${escapeHtml(r.description)}</p>
            </div>

            ${attachHtml}

            <div class="report-section">
                <div class="report-section-title">Conversation</div>
                <div class="messages-container" id="messagesContainer">
                    ${msgsHtml}
                </div>
            </div>

            ${statusHtml}

            <div class="message-compose">
                <textarea class="compose-textarea" id="composeText"
                          placeholder="Votre message…" rows="3"></textarea>
                <div class="compose-options">
                    <label class="checkbox-row" style="font-size:13px">
                        <input type="checkbox" id="composeAnon"> Envoyer anonymement
                    </label>
                    <button class="btn-primary btn-sm" id="btnSendMsg">Envoyer</button>
                </div>
            </div>
        </div>
    `;

    // Événements
    document.getElementById('btnSendMsg')?.addEventListener('click', sendMessage);
    document.getElementById('btnUpdateStatus')?.addEventListener('click', updateStatus);
    document.getElementById('btnLoadOlder')?.addEventListener('click', loadOlderMessages);
}

function buildMessagesHtml() {
    let html = '';

    if (currentMessages.hasBefore) {
        html += `<button class="btn-load-more" id="btnLoadOlder">⬆ Messages plus anciens</button>`;
    }

    if (!currentMessages.items.length) {
        html += `<div class="empty-state" style="padding:30px">
                    <span class="empty-state-icon">💬</span>
                    Aucun message pour l'instant.
                 </div>`;
        return html;
    }

    for (const m of currentMessages.items) {
        const isMe   = m.sender_id === currentUser.id;
        const isSystem = m.sender_role === 'system';

        let senderLabel = '';
        if (isSystem) {
            senderLabel = 'Système';
        } else if (m.is_anonymous) {
            senderLabel = 'Émetteur (anonyme)';
        } else {
            senderLabel = isMe ? 'Vous' : (ROLE_LABELS[m.sender_role] || m.sender_role);
        }

        const cls = isSystem ? 'system-msg' : (isMe ? 'mine' : 'theirs');
        html += `
            <div class="message ${cls}">
                <div class="message-header">
                    <span class="message-sender">${escapeHtml(senderLabel)}</span>
                    <span>${formatDateTime(m.created_at)}</span>
                </div>
                <div class="message-bubble">${escapeHtml(m.content)}</div>
            </div>
        `;
    }
    return html;
}

async function loadOlderMessages() {
    const oldestId = currentMessages.items[0]?.id;
    if (!oldestId) return;
    try {
        const data = await apiFetch(`/api/reports/${currentReport.id}/messages?limit=20&before=${oldestId}`);
        currentMessages.items    = [...data.messages, ...currentMessages.items];
        currentMessages.hasBefore = data.hasBefore;
        const container = document.getElementById('messagesContainer');
        if (container) container.innerHTML = buildMessagesHtml();
        document.getElementById('btnLoadOlder')?.addEventListener('click', loadOlderMessages);
    } catch (err) { console.error(err); }
}

async function sendMessage() {
    const btn     = document.getElementById('btnSendMsg');
    const content = document.getElementById('composeText').value.trim();
    const anon    = document.getElementById('composeAnon').checked;
    if (!content) return;

    btn.disabled  = true;
    btn.innerHTML = '<span class="loader"></span>';

    try {
        const res = await apiFetch(`/api/reports/${currentReport.id}/messages`, {
            method: 'POST',
            body:   JSON.stringify({ content, isAnonymous: anon }),
        });
        if (res.success) {
            currentMessages.items.push(res.message);
            document.getElementById('composeText').value = '';
            const container = document.getElementById('messagesContainer');
            if (container) container.innerHTML = buildMessagesHtml();
            document.getElementById('btnLoadOlder')?.addEventListener('click', loadOlderMessages);
        }
    } catch (err) { console.error(err); alert('Erreur envoi message'); }
    finally {
        btn.disabled  = false;
        btn.innerHTML = 'Envoyer';
    }
}

async function updateStatus() {
    const btn    = document.getElementById('btnUpdateStatus');
    const status = document.getElementById('selectStatus').value;
    const reason = document.getElementById('closeReason').value.trim();

    if (status.startsWith('closed') && !reason) {
        alert('Le motif de clôture est obligatoire.');
        return;
    }

    btn.disabled  = true;
    btn.innerHTML = '<span class="loader"></span>';
    try {
        await apiFetch(`/api/reports/${currentReport.id}/status`, {
            method: 'PATCH',
            body:   JSON.stringify({ status, close_reason: reason }),
        });
        await loadMyReports();
        await showReportDetail(currentReport.id);
    } catch (err) { console.error(err); alert('Erreur mise à jour'); }
    finally {
        btn.disabled  = false;
        btn.innerHTML = 'Mettre à jour';
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  PAGE GESTION DES SIGNALEMENTS (RH / JURISTE / ADMIN)
// ═════════════════════════════════════════════════════════════════════════════
async function showManagePage() {
    mainContent.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Gestion des signalements</h2>
        </div>
        <div class="reports-table-container">
            <div class="empty-state"><span class="loader"></span></div>
        </div>
    `;
    try {
        const reports = await apiFetch('/api/reports?limit=100');
        const container = mainContent.querySelector('.reports-table-container');
        if (!reports.length) {
            container.innerHTML = `<div class="empty-state">
                <span class="empty-state-icon">📭</span>Aucun signalement.</div>`;
            return;
        }
        container.innerHTML = `
            <table class="reports-table">
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Titre</th>
                        <th>Catégorie</th>
                        <th>Statut</th>
                        <th>Anonyme</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${reports.map(r => `
                        <tr data-id="${r.id}">
                            <td><span class="tracking-code">${escapeHtml(r.tracking_code)}</span></td>
                            <td>${escapeHtml(r.title)}</td>
                            <td style="color:var(--text-2)">${escapeHtml(r.category)}</td>
                            <td>${statusBadge(r.status)}</td>
                            <td>
                                <span class="badge ${r.is_anonymous ? 'badge-anon' : 'badge-ident'}">
                                    ${r.is_anonymous ? 'Oui' : 'Non'}
                                </span>
                            </td>
                            <td style="color:var(--text-3)">${formatDate(r.created_at)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        container.querySelectorAll('tr[data-id]').forEach(row => {
            row.addEventListener('click', () => showReportDetail(parseInt(row.dataset.id)));
        });
    } catch (err) { console.error(err); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  PAGE AUDIT LOGS
// ═════════════════════════════════════════════════════════════════════════════
async function showAuditPage() {
    mainContent.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Journal d'audit</h2>
        </div>
        <div class="audit-filters">
            <div class="form-group">
                <label>Action</label>
                <input class="form-control" id="filterAction" type="text" placeholder="ex: LOGIN">
            </div>
            <div class="form-group">
                <label>Type d'entité</label>
                <select class="form-control" id="filterEntity">
                    <option value="">Tous</option>
                    <option value="user">user</option>
                    <option value="report">report</option>
                    <option value="message">message</option>
                </select>
            </div>
            <button class="btn-primary btn-sm" id="btnAuditSearch">Rechercher</button>
        </div>
        <div style="padding:0 32px">
            <div class="empty-state"><span class="loader"></span></div>
        </div>
    `;
    document.getElementById('btnAuditSearch').addEventListener('click', fetchAuditLogs);
    await fetchAuditLogs();
}

async function fetchAuditLogs() {
    const action     = document.getElementById('filterAction')?.value || '';
    const entityType = document.getElementById('filterEntity')?.value || '';
    let url = '/api/audit-logs?limit=100';
    if (action)     url += `&action=${encodeURIComponent(action)}`;
    if (entityType) url += `&entityType=${encodeURIComponent(entityType)}`;

    const wrapper = mainContent.querySelector('[style="padding:0 32px"]') ||
                    mainContent.lastElementChild;
    if (wrapper) wrapper.innerHTML = `<div class="empty-state"><span class="loader"></span></div>`;

    try {
        const logs = await apiFetch(url);
        if (!wrapper) return;
        if (!logs.length) {
            wrapper.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📜</span>Aucun log.</div>`;
            return;
        }
        wrapper.innerHTML = `
            <table class="audit-table">
                <thead>
                    <tr>
                        <th>Date</th><th>Utilisateur</th><th>Action</th>
                        <th>Entité</th><th>ID</th><th>IP</th>
                    </tr>
                </thead>
                <tbody>
                    ${logs.map(l => `
                        <tr>
                            <td>${formatDateTime(l.created_at)}</td>
                            <td>${escapeHtml(l.user_email || '—')}</td>
                            <td style="color:var(--accent)">${escapeHtml(l.action)}</td>
                            <td>${escapeHtml(l.entity_type)}</td>
                            <td>${l.entity_id ?? '—'}</td>
                            <td>${escapeHtml(l.ip_address || '—')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (err) { console.error(err); }
}

// ═════════════════════════════════════════════════════════════════════════════
//  PAGE ADMIN UTILISATEURS
// ═════════════════════════════════════════════════════════════════════════════
async function showUsersPage() {
    mainContent.innerHTML = `
        <div class="page-header">
            <h2 class="page-title">Gestion des utilisateurs</h2>
            <button class="btn-primary btn-sm" id="btnAddUser">＋ Ajouter</button>
        </div>
        <div style="padding:0 32px">
            <div class="empty-state"><span class="loader"></span></div>
        </div>
    `;
    document.getElementById('btnAddUser').addEventListener('click', showAddUserForm);
    await fetchUsers();
}

async function fetchUsers() {
    const wrapper = mainContent.querySelector('[style="padding:0 32px"]');
    try {
        const users = await apiFetch('/api/admin/users');
        if (!wrapper) return;
        if (!users.length) {
            wrapper.innerHTML = `<div class="empty-state">Aucun utilisateur.</div>`;
            return;
        }
        wrapper.innerHTML = `
            <table class="users-table">
                <thead>
                    <tr>
                        <th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(u => {
                        const locked = u.locked_until && new Date(u.locked_until) > new Date();
                        return `
                        <tr>
                            <td>${escapeHtml(u.fullname)}</td>
                            <td style="color:var(--text-2)">${escapeHtml(u.email)}</td>
                            <td><span class="badge badge-system">${ROLE_LABELS[u.role] || u.role}</span></td>
                            <td>
                                <span class="badge ${locked ? 'badge-anon' : 'badge-ident'}">
                                    ${locked ? 'Désactivé' : 'Actif'}
                                </span>
                            </td>
                            <td style="color:var(--text-3)">${formatDate(u.created_at)}</td>
                            <td>
                                ${u.id !== currentUser.id ? `
                                    <button class="btn-ghost btn-sm" data-action="edit" data-id="${u.id}"
                                            data-fullname="${escapeHtml(u.fullname)}"
                                            data-email="${escapeHtml(u.email)}"
                                            data-role="${u.role}">
                                        Modifier
                                    </button>
                                    ${!locked ? `
                                        <button class="btn-danger btn-sm" style="margin-left:6px"
                                                data-action="disable" data-id="${u.id}"
                                                data-name="${escapeHtml(u.fullname)}">
                                            Désactiver
                                        </button>
                                    ` : ''}
                                ` : '<span style="color:var(--text-3);font-size:12px">Vous</span>'}
                            </td>
                        </tr>
                    `}).join('')}
                </tbody>
            </table>
        `;
        wrapper.querySelectorAll('[data-action="disable"]').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal(
                    'Désactiver l\'utilisateur',
                    `Désactiver ${btn.dataset.name} ? Cette action peut être annulée en modifiant l'utilisateur.`,
                    () => disableUser(btn.dataset.id),
                    'Désactiver'
                );
            });
        });
        wrapper.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', () => showEditUserForm(btn.dataset));
        });
    } catch (err) { console.error(err); }
}

function showAddUserForm() {
    showUserFormModal(null);
}
function showEditUserForm(data) {
    showUserFormModal(data);
}

function showUserFormModal(data) {
    const isEdit = !!data?.id;
    modalTitle.textContent   = isEdit ? 'Modifier l\'utilisateur' : 'Ajouter un utilisateur';
    modalMessage.textContent = '';
    modalConfirm.textContent = isEdit ? 'Enregistrer' : 'Créer';

    // Injecter un formulaire dans le modal
    const formHtml = `
        <div class="form-group" style="margin-bottom:12px">
            <label style="font-size:13px;color:var(--text-2)">Nom complet</label>
            <input class="form-control" id="mFullname" value="${data?.fullname || ''}">
        </div>
        <div class="form-group" style="margin-bottom:12px">
            <label style="font-size:13px;color:var(--text-2)">Email</label>
            <input class="form-control" id="mEmail" type="email" value="${data?.email || ''}">
        </div>
        ${!isEdit ? `
        <div class="form-group" style="margin-bottom:12px">
            <label style="font-size:13px;color:var(--text-2)">Mot de passe</label>
            <input class="form-control" id="mPassword" type="password" placeholder="8 caractères min">
        </div>
        ` : ''}
        <div class="form-group" style="margin-bottom:0">
            <label style="font-size:13px;color:var(--text-2)">Rôle</label>
            <select class="form-control" id="mRole">
                <option value="employee" ${data?.role==='employee'?'selected':''}>Employé</option>
                <option value="hr"       ${data?.role==='hr'      ?'selected':''}>RH</option>
                <option value="legal"    ${data?.role==='legal'   ?'selected':''}>Juriste</option>
                <option value="admin"    ${data?.role==='admin'   ?'selected':''}>Admin</option>
            </select>
        </div>
    `;
    modal.querySelector('p').innerHTML = formHtml;
    modalOverlay.classList.remove('hidden');

    modalConfirm.onclick = async () => {
        const fullname = document.getElementById('mFullname').value.trim();
        const email    = document.getElementById('mEmail').value.trim();
        const password = document.getElementById('mPassword')?.value;
        const role     = document.getElementById('mRole').value;

        if (!fullname || !email || (!isEdit && !password)) {
            alert('Veuillez remplir tous les champs.');
            return;
        }
        try {
            if (isEdit) {
                await apiFetch(`/api/admin/users/${data.id}`, {
                    method: 'PATCH',
                    body:   JSON.stringify({ fullname, email, role }),
                });
            } else {
                await apiFetch('/api/admin/users', {
                    method: 'POST',
                    body:   JSON.stringify({ fullname, email, password, role }),
                });
            }
            closeModal();
            await fetchUsers();
        } catch (err) { alert('Erreur : ' + err.message); }
    };
}

async function disableUser(userId) {
    try {
        await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        await fetchUsers();
    } catch (err) { alert('Erreur désactivation'); }
}

// ── Welcome ───────────────────────────────────────────────────────────────────
function showWelcome() {
    currentReport = null;
    renderReportsList();
    mainContent.innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-icon">📋</div>
            <h2>Bienvenue sur le portail</h2>
            <p>Sélectionnez un signalement dans la liste ou créez-en un nouveau.</p>
            <button class="btn-primary" id="btnNewReportWelcome">
                ＋ Nouveau signalement
            </button>
        </div>
    `;
    document.getElementById('btnNewReportWelcome')
        ?.addEventListener('click', showNewReportForm);
}
