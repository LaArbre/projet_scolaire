import { getSession, logout } from '../global/auth.js';
import { apiFetch, getCsrfToken } from '../global/utils.js';

let currentUser = null;
let currentReportId = null;
let myReports = [];

const sidebarNav = document.getElementById('sidebarNav');
const reportsList = document.getElementById('reportsList');
const mainContent = document.getElementById('mainContent');
const btnNewReport = document.getElementById('btnNewReport');
const btnLogout = document.getElementById('btnLogout');

document.addEventListener('DOMContentLoaded', init);

async function init() {
    const session = await getSession();
    if (!session.authenticated) {
        window.location.href = '/login/';
        return;
    }
    currentUser = session.user;
    renderSidebarNav();
    loadMyReports();
}

function renderSidebarNav() {
    let navHtml = '';
    if (['hr', 'legal', 'admin'].includes(currentUser.role)) {
        navHtml += `<a class="nav-link" data-page="manage">📋 Gestion des signalements</a>`;
    }
    if (['legal', 'admin'].includes(currentUser.role)) {
        navHtml += `<a class="nav-link" data-page="audit">🔍 Journal d'audit</a>`;
    }
    if (currentUser.role === 'admin') {
        navHtml += `<a class="nav-link" data-page="users">👥 Utilisateurs</a>`;
        navHtml += `<a class="nav-link" data-page="system">⚙️ Logs système</a>`;
    }
    sidebarNav.innerHTML = navHtml;

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            navigateTo(page);
        });
    });
}

async function loadMyReports() {
    try {
        const data = await apiFetch('/api/reports');
        myReports = data;
        renderReportsList();
    } catch (err) {
        console.error('Erreur chargement reports', err);
    }
}

function renderReportsList() {
    if (!myReports.length) {
        reportsList.innerHTML = '<li class="report-item">Aucun signalement</li>';
        return;
    }
    reportsList.innerHTML = myReports.map(report => `
        <li class="report-item ${currentReportId === report.id ? 'selected' : ''}" data-report-id="${report.id}">
            <div class="report-title">${escapeHtml(report.category)}</div>
            <div class="report-meta">
                <span>${new Date(report.created_at).toLocaleDateString()}</span>
                <span class="status-badge status-${report.status}">${formatStatus(report.status)}</span>
            </div>
        </li>
    `).join('');

    document.querySelectorAll('.report-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.reportId;
            showReportDetail(id);
        });
    });
}

function formatStatus(status) {
    const map = {
        'open': 'Ouvert',
        'in_progress': 'En cours',
        'waiting_info': 'Attente info',
        'closed_founded': 'Clôturé fondé',
        'closed_unfounded': 'Clôturé non fondé'
    };
    return map[status] || status;
}

function escapeHtml(unsafe) {
    return unsafe.replace(/[&<>"]/g, function(m) {
        if(m === '&') return '&amp;';
        if(m === '<') return '&lt;';
        if(m === '>') return '&gt;';
        if(m === '"') return '&quot;';
        return m;
    });
}

function navigateTo(page) {
    const paths = {
        manage: '/manage-reports/',
        audit: '/audit/',
        users: '/admin/users/',
        system: '/admin/system/'
    };
    if (paths[page]) {
        window.location.href = paths[page];
    }
}

btnNewReport.addEventListener('click', () => {
    showNewReportForm();
});

function showNewReportForm() {
    mainContent.innerHTML = `
        <div class="form-container">
            <h2>Nouveau signalement</h2>
            <form id="newReportForm">
                <div class="form-group">
                    <label for="category">Catégorie *</label>
                    <select id="category" name="category" required>
                        <option value="">Choisissez...</option>
                        <option value="Harcèlement moral">Harcèlement moral</option>
                        <option value="Harcèlement sexuel">Harcèlement sexuel</option>
                        <option value="Discrimination">Discrimination</option>
                        <option value="Conflit hiérarchique">Conflit hiérarchique</option>
                        <option value="Atteinte à l'éthique">Atteinte à l'éthique</option>
                        <option value="Autre">Autre</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="description">Description *</label>
                    <textarea id="description" name="description" required></textarea>
                </div>
                <div class="form-group checkbox-group">
                    <input type="checkbox" id="isAnonymous" name="is_anonymous">
                    <label for="isAnonymous">Rester anonyme</label>
                </div>
                <div class="form-group">
                    <label for="attachments">Pièces jointes (max 5, 10 Mo)</label>
                    <input type="file" id="attachments" name="attachments" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.mp3,.wav,.txt">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn-cancel" id="cancelNewReport">Annuler</button>
                    <button type="submit" class="btn-submit">Envoyer</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('cancelNewReport').addEventListener('click', () => {
        mainContent.innerHTML = '<div class="welcome-message"><p>Sélectionnez un signalement ou créez-en un nouveau.</p></div>';
    });

    document.getElementById('newReportForm').addEventListener('submit', submitNewReport);
}

async function submitNewReport(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
        const token = await getCsrfToken();
        const response = await fetch('/api/reports', {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers: {
                'X-CSRF-Token': token
            }
        });
        const data = await response.json();
        if (data.success) {
            await loadMyReports();
            showReportDetail(data.report_id);
        } else {
            alert('Erreur lors de la création');
        }
    } catch (err) {
        console.error(err);
        alert('Erreur réseau');
    }
}

async function showReportDetail(reportId) {
    currentReportId = parseInt(reportId);
    document.querySelectorAll('.report-item').forEach(item => {
        item.classList.toggle('selected', parseInt(item.dataset.reportId) === currentReportId);
    });

    try {
        const report = await apiFetch(`/api/reports/${reportId}`);
        renderReportDetail(report);
    } catch (err) {
        console.error(err);
        mainContent.innerHTML = '<p>Erreur chargement du signalement.</p>';
    }
}

function renderReportDetail(report) {
    let attachmentsHtml = '';
    if (report.attachments && report.attachments.length) {
        attachmentsHtml = `
            <div class="attachments">
                <h3>Pièces jointes</h3>
                <ul class="attachment-list">
                    ${report.attachments.map(a => {
                        if (a.mime_type.startsWith('image/')) {
                            return `<li class="attachment-item">
                                <img src="/api/attachments/${a.id}" alt="${a.filename}" onclick="window.open('/api/attachments/${a.id}', '_blank')">
                                <span>${a.filename}</span>
                            </li>`;
                        } else {
                            return `<li class="attachment-item">
                                <a href="/api/attachments/${a.id}" download="${a.filename}">📎 ${a.filename}</a>
                            </li>`;
                        }
                    }).join('')}
                </ul>
            </div>
        `;
    }

    let messagesHtml = '';
    if (report.messages && report.messages.length) {
        messagesHtml = report.messages.map(m => {
            const sender = m.is_anonymous ? 'Anonyme' : (m.sender_role === 'employee' ? 'Vous' : m.sender_role.toUpperCase());
            return `
                <div class="message">
                    <div class="message-header">
                        <span class="message-sender">${sender}</span>
                        <span>${new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <div class="message-content">${escapeHtml(m.content)}</div>
                </div>
            `;
        }).join('');
    }

    let statusActions = '';
    if (['hr', 'legal', 'admin'].includes(currentUser.role) && report.status !== 'closed_founded' && report.status !== 'closed_unfounded') {
        statusActions = `
            <div class="status-actions">
                <select id="newStatus">
                    <option value="in_progress">En cours</option>
                    <option value="waiting_info">En attente d'info</option>
                    <option value="closed_founded">Clôturer (fondé)</option>
                    <option value="closed_unfounded">Clôturer (non fondé)</option>
                </select>
                <input type="text" id="closeReason" placeholder="Motif de clôture (obligatoire si clôture)">
                <button id="btnUpdateStatus">Mettre à jour</button>
            </div>
        `;
    }

    const html = `
        <div class="report-detail">
            <div class="report-header">
                <h2>${escapeHtml(report.category)}</h2>
                <span class="status-badge status-${report.status}">${formatStatus(report.status)}</span>
            </div>
            <div class="report-meta">
                <p><strong>Code de suivi :</strong> ${report.tracking_code}</p>
                <p><strong>Date :</strong> ${new Date(report.created_at).toLocaleString()}</p>
                ${report.closed_at ? `<p><strong>Clôturé le :</strong> ${new Date(report.closed_at).toLocaleString()}</p>` : ''}
                ${report.close_reason ? `<p><strong>Motif :</strong> ${escapeHtml(report.close_reason)}</p>` : ''}
                <p><strong>Anonyme :</strong> ${report.is_anonymous ? 'Oui' : 'Non'}</p>
            </div>
            <div class="report-description">
                ${escapeHtml(report.description)}
            </div>
            ${attachmentsHtml}
            <div class="message-thread">
                <h3>Conversation</h3>
                ${messagesHtml || '<p>Aucun message</p>'}
            </div>
            ${statusActions}
            <div class="new-message">
                <textarea id="newMessageContent" placeholder="Votre message..."></textarea>
                <button id="btnSendMessage">Envoyer</button>
            </div>
        </div>
    `;

    mainContent.innerHTML = html;

    if (statusActions) {
        document.getElementById('btnUpdateStatus').addEventListener('click', () => updateStatus(report.id));
    }
    document.getElementById('btnSendMessage').addEventListener('click', () => sendMessage(report.id));
}

async function updateStatus(reportId) {
    const newStatus = document.getElementById('newStatus').value;
    const closeReason = document.getElementById('closeReason').value;
    try {
        const res = await apiFetch(`/api/reports/${reportId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus, close_reason: closeReason }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.success) {
            showReportDetail(reportId);
        } else {
            alert('Erreur mise à jour');
        }
    } catch (err) {
        console.error(err);
        alert('Erreur réseau');
    }
}

async function sendMessage(reportId) {
    const content = document.getElementById('newMessageContent').value;
    if (!content.trim()) return;
    try {
        const res = await apiFetch(`/api/reports/${reportId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content, isAnonymous: false }),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.success) {
            showReportDetail(reportId);
        } else {
            alert('Erreur envoi message');
        }
    } catch (err) {
        console.error(err);
        alert('Erreur réseau');
    }
}

btnLogout.addEventListener('click', async () => {
    await logout();
    window.location.href = '/login/';
});