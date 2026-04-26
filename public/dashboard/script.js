import { getSession, logout } from '../global/auth.js';
import { apiFetch, getCsrfToken } from '../global/utils.js';

// ─── State ───────────────────────────────────────────────────
let currentUser = null;
let currentReportId = null;
let myReports = [];

// ─── DOM refs ────────────────────────────────────────────────
const sidebarNav   = document.getElementById('sidebarNav');
const reportsList  = document.getElementById('reportsList');
const mainContent  = document.getElementById('mainContent');
const btnNewReport = document.getElementById('btnNewReport');
const btnLogout    = document.getElementById('btnLogout');
const userAvatar   = document.getElementById('userAvatar');
const userName     = document.getElementById('userName');
const userRole     = document.getElementById('userRole');
const welcomeNewBtn = document.getElementById('welcomeNewBtn');

// ─── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
    const session = await getSession();
    if (!session.authenticated) {
        window.location.href = '/login/';
        return;
    }
    currentUser = session.user;
    renderUserBadge();
    renderSidebarNav();
    loadMyReports();

    btnNewReport.addEventListener('click', showNewReportForm);
    welcomeNewBtn?.addEventListener('click', showNewReportForm);
    btnLogout.addEventListener('click', handleLogout);
}

// ─── User badge ───────────────────────────────────────────────
function renderUserBadge() {
    const name = currentUser.name || currentUser.email || 'Utilisateur';
    userAvatar.textContent = name.charAt(0).toUpperCase();
    userName.textContent = name;
    userRole.textContent = currentUser.role || '';
}

// ─── Sidebar nav ─────────────────────────────────────────────
function renderSidebarNav() {
    const links = [];
    if (['hr', 'legal', 'admin'].includes(currentUser.role)) {
        links.push({ page: 'manage', icon: '📋', label: 'Gestion des signalements' });
    }
    if (['legal', 'admin'].includes(currentUser.role)) {
        links.push({ page: 'audit', icon: '🔍', label: "Journal d'audit" });
    }
    if (currentUser.role === 'admin') {
        links.push({ page: 'users',  icon: '👥', label: 'Utilisateurs' });
        links.push({ page: 'system', icon: '⚙️', label: 'Logs système' });
    }

    if (!links.length) { sidebarNav.style.display = 'none'; return; }

    sidebarNav.innerHTML = links.map(l =>
        `<a class="nav-link" data-page="${l.page}">${l.icon} ${l.label}</a>`
    ).join('');

    sidebarNav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(link.dataset.page);
        });
    });
}

// ─── Load reports ─────────────────────────────────────────────
async function loadMyReports() {
    try {
        const data = await apiFetch('/api/reports');
        myReports = data;
        renderReportsList();
    } catch (err) {
        console.error('Erreur chargement reports', err);
        reportsList.innerHTML = '<li class="report-item"><span style="color:var(--text-muted);font-size:.8rem">Impossible de charger.</span></li>';
    }
}

function renderReportsList() {
    if (!myReports.length) {
        reportsList.innerHTML = '<li class="empty-state">Aucun signalement</li>';
        return;
    }
    reportsList.innerHTML = myReports.map((r, i) => `
        <li class="report-item ${currentReportId === r.id ? 'selected' : ''}"
            data-report-id="${r.id}"
            style="animation-delay:${i * 0.05}s">
            <div class="report-title">${escapeHtml(r.category)}</div>
            <div class="report-meta">
                <span>${new Date(r.created_at).toLocaleDateString('fr-FR')}</span>
                <span class="status-badge status-${r.status}">${formatStatus(r.status)}</span>
            </div>
        </li>
    `).join('');

    reportsList.querySelectorAll('.report-item').forEach(item => {
        item.addEventListener('click', () => showReportDetail(item.dataset.reportId));
    });
}

// ─── New report form ──────────────────────────────────────────
function showNewReportForm() {
    mainContent.innerHTML = `
        <div class="form-wrapper">
            <div class="form-header">
                <h2>Nouveau signalement</h2>
                <p>Tous les champs marqués d'un <span style="color:var(--danger)">*</span> sont obligatoires.</p>
            </div>
            <div class="form-card">
                <div class="form-group">
                    <label for="category">Catégorie <span class="required">*</span></label>
                    <select id="category" name="category">
                        <option value="">Choisissez une catégorie...</option>
                        <option value="Harcèlement moral">Harcèlement moral</option>
                        <option value="Harcèlement sexuel">Harcèlement sexuel</option>
                        <option value="Discrimination">Discrimination</option>
                        <option value="Conflit hiérarchique">Conflit hiérarchique</option>
                        <option value="Atteinte à l'éthique">Atteinte à l'éthique</option>
                        <option value="Autre">Autre</option>
                    </select>
                    <div class="field-error hidden" id="err-category">⚠ Veuillez sélectionner une catégorie.</div>
                </div>

                <div class="form-group">
                    <label for="description">Description <span class="required">*</span></label>
                    <textarea id="description" name="description" placeholder="Décrivez les faits de manière précise et factuelle..." maxlength="5000"></textarea>
                    <div class="char-hint" id="descCount">0 / 5000</div>
                    <div class="field-error hidden" id="err-description">⚠ La description est requise (minimum 20 caractères).</div>
                </div>

                <div class="form-group">
                    <label>Anonymat</label>
                    <label class="anon-toggle" for="isAnonymous">
                        <input type="checkbox" id="isAnonymous" name="is_anonymous">
                        <div class="toggle-track"></div>
                        <div class="toggle-text">
                            <strong>Rester anonyme</strong>
                            <span>Votre identité ne sera pas révélée aux gestionnaires</span>
                        </div>
                    </label>
                </div>

                <div class="form-group">
                    <label>Pièces jointes <span style="color:var(--text-muted);font-weight:400">(max 5 fichiers, 10 Mo)</span></label>
                    <div class="file-drop" id="fileDrop">
                        <input type="file" id="attachments" name="attachments" multiple
                            accept=".pdf,.jpg,.jpeg,.png,.gif,.mp3,.wav,.txt">
                        <div class="file-drop-icon">📎</div>
                        <p>Glissez-déposez vos fichiers ici</p>
                        <small>PDF, images, audio, texte acceptés</small>
                    </div>
                    <div class="file-list" id="fileList"></div>
                </div>

                <div class="divider"></div>

                <div class="form-actions">
                    <button class="btn-cancel" id="cancelNewReport">Annuler</button>
                    <button class="btn-submit" id="submitNewReport">
                        <span>Envoyer le signalement</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Char counter
    const desc  = document.getElementById('description');
    const count = document.getElementById('descCount');
    desc.addEventListener('input', () => {
        const len = desc.value.length;
        count.textContent = `${len} / 5000`;
        count.className = `char-hint${len > 4500 ? ' warn' : ''}`;
    });

    // File display
    const fileInput = document.getElementById('attachments');
    const fileList  = document.getElementById('fileList');
    fileInput.addEventListener('change', () => {
        fileList.innerHTML = Array.from(fileInput.files).map(f =>
            `<div class="file-chip">📄 ${escapeHtml(f.name)}</div>`
        ).join('');
    });

    // Drag over styling
    const drop = document.getElementById('fileDrop');
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('dragover'); });

    // Cancel
    document.getElementById('cancelNewReport').addEventListener('click', () => {
        confirm_('Annuler le signalement', 'Vos informations non sauvegardées seront perdues. Continuer ?', () => {
            showWelcome();
        });
    });

    // Submit
    document.getElementById('submitNewReport').addEventListener('click', submitNewReport);
}

// ─── Validation ───────────────────────────────────────────────
function validateNewReportForm() {
    let valid = true;

    const category = document.getElementById('category');
    const errCat   = document.getElementById('err-category');
    if (!category.value) {
        category.classList.add('error');
        errCat.classList.remove('hidden');
        valid = false;
    } else {
        category.classList.remove('error');
        errCat.classList.add('hidden');
    }

    const description = document.getElementById('description');
    const errDesc     = document.getElementById('err-description');
    if (description.value.trim().length < 20) {
        description.classList.add('error');
        errDesc.classList.remove('hidden');
        valid = false;
    } else {
        description.classList.remove('error');
        errDesc.classList.add('hidden');
    }

    return valid;
}

async function submitNewReport() {
    if (!validateNewReportForm()) {
        showToast('Veuillez corriger les erreurs avant d\'envoyer.', 'error');
        return;
    }

    const btn = document.getElementById('submitNewReport');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div><span>Envoi en cours...</span>';

    const formData = new FormData();
    formData.append('category',     document.getElementById('category').value);
    formData.append('description',  document.getElementById('description').value);
    formData.append('is_anonymous', document.getElementById('isAnonymous').checked);
    const files = document.getElementById('attachments').files;
    for (const f of files) formData.append('attachments', f);

    try {
        const token = await getCsrfToken();
        const response = await fetch('/api/reports', {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers: { 'X-CSRF-Token': token }
        });
        const data = await response.json();
        if (data.success) {
            showToast('Signalement créé avec succès !', 'success');
            await loadMyReports();
            showReportDetail(data.report_id);
        } else {
            showToast('Erreur lors de la création du signalement.', 'error');
            btn.disabled = false;
            btn.innerHTML = '<span>Envoyer le signalement</span>';
        }
    } catch (err) {
        console.error(err);
        showToast('Erreur réseau. Vérifiez votre connexion.', 'error');
        btn.disabled = false;
        btn.innerHTML = '<span>Envoyer le signalement</span>';
    }
}

// ─── Report detail ────────────────────────────────────────────
async function showReportDetail(reportId) {
    currentReportId = parseInt(reportId);

    // Highlight sidebar
    reportsList.querySelectorAll('.report-item').forEach(item => {
        item.classList.toggle('selected', parseInt(item.dataset.reportId) === currentReportId);
    });

    mainContent.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted)">Chargement...</div>`;

    try {
        const report = await apiFetch(`/api/reports/${reportId}`);
        renderReportDetail(report);
    } catch (err) {
        console.error(err);
        mainContent.innerHTML = `<div style="padding:32px;color:var(--danger)">Erreur lors du chargement du signalement.</div>`;
    }
}

function renderReportDetail(report) {
    // Attachments
    let attachHtml = '';
    if (report.attachments?.length) {
        attachHtml = `
            <div class="detail-card full">
                <h3>Pièces jointes</h3>
                <div class="attachment-grid">
                    ${report.attachments.map(a => {
                        if (a.mime_type.startsWith('image/')) {
                            return `<span>
                                <img class="attachment-thumb" src="/api/attachments/${a.id}"
                                    alt="${escapeHtml(a.filename)}"
                                    onclick="window.open('/api/attachments/${a.id}', '_blank')">
                            </span>`;
                        }
                        return `<a class="attachment-chip" href="/api/attachments/${a.id}" download="${escapeHtml(a.filename)}">
                            📎 ${escapeHtml(a.filename)}
                        </a>`;
                    }).join('')}
                </div>
            </div>`;
    }

    // Messages
    const messagesHtml = report.messages?.length
        ? report.messages.map(m => {
            const isMe = m.sender_role === 'employee';
            const sender = m.is_anonymous ? 'Anonyme' : (isMe ? 'Vous' : m.sender_role.toUpperCase());
            return `<div class="message ${isMe ? 'is-mine' : ''}">
                <div class="message-header">
                    <span class="message-sender">${escapeHtml(sender)}</span>
                    <span class="message-date">${new Date(m.created_at).toLocaleString('fr-FR')}</span>
                </div>
                <div class="message-body">${escapeHtml(m.content)}</div>
            </div>`;
        }).join('')
        : '<div class="empty-state">Aucun message pour l\'instant.</div>';

    // Status update (HR/admin only)
    const canUpdate = ['hr', 'legal', 'admin'].includes(currentUser.role)
        && !['closed_founded', 'closed_unfounded'].includes(report.status);

    const statusHtml = canUpdate ? `
        <div class="detail-card full">
            <div class="status-section">
                <h3>Mettre à jour le statut</h3>
                <select id="newStatus">
                    <option value="in_progress">En cours</option>
                    <option value="waiting_info">En attente d'info</option>
                    <option value="closed_founded">Clôturer (fondé)</option>
                    <option value="closed_unfounded">Clôturer (non fondé)</option>
                </select>
                <input type="text" id="closeReason" placeholder="Motif de clôture (requis si clôture)">
                <button class="btn-update-status" id="btnUpdateStatus">Mettre à jour</button>
            </div>
        </div>` : '';

    mainContent.innerHTML = `
        <div class="detail-wrapper">
            <div class="detail-topbar">
                <div class="detail-title-block">
                    <h2>${escapeHtml(report.category)}</h2>
                    <div class="meta-row">
                        <span class="status-badge status-${report.status}">${formatStatus(report.status)}</span>
                        <span class="meta-item"><span class="meta-icon">📅</span>${new Date(report.created_at).toLocaleDateString('fr-FR')}</span>
                        <span class="meta-item"><span class="meta-icon">👤</span>${report.is_anonymous ? 'Anonyme' : 'Identifié'}</span>
                        ${report.closed_at ? `<span class="meta-item"><span class="meta-icon">✅</span>Clôturé le ${new Date(report.closed_at).toLocaleDateString('fr-FR')}</span>` : ''}
                    </div>
                </div>
            </div>

            <div class="detail-grid">
                <div class="detail-card">
                    <h3>Code de suivi</h3>
                    <span class="tracking-code">${escapeHtml(report.tracking_code)}</span>
                </div>
                <div class="detail-card">
                    <h3>Informations</h3>
                    <div class="info-list">
                        <div class="info-row">
                            <span class="label">Statut</span>
                            <span class="value">${formatStatus(report.status)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Anonyme</span>
                            <span class="value">${report.is_anonymous ? 'Oui' : 'Non'}</span>
                        </div>
                        ${report.close_reason ? `<div class="info-row">
                            <span class="label">Motif clôture</span>
                            <span class="value">${escapeHtml(report.close_reason)}</span>
                        </div>` : ''}
                    </div>
                </div>
                <div class="detail-card full">
                    <h3>Description</h3>
                    <div class="description-text">${escapeHtml(report.description)}</div>
                </div>
                ${attachHtml}
                <div class="detail-card full">
                    <h3>Conversation</h3>
                    <div class="thread-messages" id="threadMessages">
                        ${messagesHtml}
                    </div>
                    <div class="new-message-area">
                        <textarea id="newMessageContent" placeholder="Votre message..."></textarea>
                        <div class="message-send-row">
                            <button class="btn-send" id="btnSendMessage">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                Envoyer
                            </button>
                        </div>
                    </div>
                </div>
                ${statusHtml}
            </div>
        </div>
    `;

    // Scroll thread to bottom
    const thread = document.getElementById('threadMessages');
    if (thread) thread.scrollTop = thread.scrollHeight;

    // Events
    document.getElementById('btnSendMessage').addEventListener('click', () => sendMessage(report.id));
    if (canUpdate) {
        document.getElementById('btnUpdateStatus').addEventListener('click', () => updateStatus(report.id));
    }
}

// ─── Update status ────────────────────────────────────────────
async function updateStatus(reportId) {
    const newStatus   = document.getElementById('newStatus').value;
    const closeReason = document.getElementById('closeReason').value.trim();

    const isClosing = newStatus.startsWith('closed_');
    if (isClosing && !closeReason) {
        showToast('Un motif de clôture est requis.', 'warning');
        document.getElementById('closeReason').focus();
        return;
    }

    const label = isClosing ? 'Clôturer ce signalement' : 'Mettre à jour le statut';
    confirm_(label, 'Cette action modifiera l\'état du signalement. Confirmer ?', async () => {
        try {
            const res = await apiFetch(`/api/reports/${reportId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus, close_reason: closeReason }),
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.success) {
                showToast('Statut mis à jour.', 'success');
                await loadMyReports();
                showReportDetail(reportId);
            } else {
                showToast('Erreur lors de la mise à jour.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Erreur réseau.', 'error');
        }
    });
}

// ─── Send message ─────────────────────────────────────────────
async function sendMessage(reportId) {
    const textarea = document.getElementById('newMessageContent');
    const content  = textarea.value.trim();
    if (!content) {
        showToast('Le message ne peut pas être vide.', 'warning');
        textarea.focus();
        return;
    }

    const btn = document.getElementById('btnSendMessage');
    btn.disabled = true;

    try {
        const res = await apiFetch(`/api/reports/${reportId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, isAnonymous: false }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.success) {
            showToast('Message envoyé.', 'success');
            showReportDetail(reportId);
        } else {
            showToast('Erreur lors de l\'envoi.', 'error');
            btn.disabled = false;
        }
    } catch (err) {
        console.error(err);
        showToast('Erreur réseau.', 'error');
        btn.disabled = false;
    }
}

// ─── Logout ───────────────────────────────────────────────────
function handleLogout() {
    confirm_('Déconnexion', 'Êtes-vous sûr de vouloir vous déconnecter ?', async () => {
        await logout();
        window.location.href = '/login/';
    });
}

// ─── Navigation ───────────────────────────────────────────────
function navigateTo(page) {
    const paths = {
        manage: '/management/',
        audit:  '/audit/',
        users:  '/admin/users/',
        system: '/admin/system/'
    };
    if (paths[page]) window.location.href = paths[page];
}

function showWelcome() {
    currentReportId = null;
    reportsList.querySelectorAll('.report-item').forEach(i => i.classList.remove('selected'));
    mainContent.innerHTML = `
        <div class="welcome-screen">
            <div class="welcome-glow"></div>
            <div class="welcome-inner">
                <div class="welcome-emoji">⚖️</div>
                <h1>Bienvenue</h1>
                <p>Sélectionnez un signalement dans la barre latérale<br>ou créez-en un nouveau pour commencer.</p>
                <button class="welcome-cta" id="welcomeNewBtn2">+ Nouveau signalement</button>
            </div>
        </div>`;
    document.getElementById('welcomeNewBtn2')?.addEventListener('click', showNewReportForm);
}

// ─── Toast system ─────────────────────────────────────────────
function showToast(message, type = 'info') {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-msg">${escapeHtml(message)}</span>
        <button class="toast-close">✕</button>
    `;
    container.appendChild(toast);

    const remove = () => {
        toast.classList.add('toast-out');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };
    toast.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, 4000);
}

// ─── Confirm modal ────────────────────────────────────────────
function confirm_(title, message, onConfirm) {
    const overlay = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent   = title;
    document.getElementById('confirmMessage').textContent = message;
    overlay.classList.remove('hidden');

    const ok     = document.getElementById('confirmOk');
    const cancel = document.getElementById('confirmCancel');

    const close = () => overlay.classList.add('hidden');

    const handleOk = () => { close(); onConfirm(); ok.removeEventListener('click', handleOk); cancel.removeEventListener('click', close); };
    ok.addEventListener('click', handleOk);
    cancel.addEventListener('click', () => { close(); ok.removeEventListener('click', handleOk); });
}

// ─── Helpers ──────────────────────────────────────────────────
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

function formatStatus(status) {
    return {
        'open':              'Ouvert',
        'in_progress':       'En cours',
        'waiting_info':      'Attente info',
        'closed_founded':    'Clôturé fondé',
        'closed_unfounded':  'Clôturé non fondé'
    }[status] || status;
}
