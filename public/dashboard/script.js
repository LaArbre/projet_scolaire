import { getSession, logout } from '../global/auth.js';
import { apiFetch, getCsrfToken } from '../global/utils.js';

// ─── STATE ────────────────────────────────────────────────────
let currentUser = null;
let allReports = [];
let filtered = [];
let filteredStatus = '';
let searchQuery = '';

// Files à uploader
let filesToUpload = [];

// ─── DOM ──────────────────────────────────────────────────────
const toastContainer = document.getElementById('toastContainer');
const modal = document.getElementById('newReportModal');
const reportForm = document.getElementById('reportForm');
const fileDrop = document.getElementById('fileDrop');
const fileInput = document.getElementById('reportFiles');
const filesList = document.getElementById('filesList');
const reportsList = document.getElementById('reportsList');
const emptyState = document.getElementById('emptyState');

const reportTitle = document.getElementById('reportTitle');
const reportCategory = document.getElementById('reportCategory');
const reportDescription = document.getElementById('reportDescription');
const reportAnonymous = document.getElementById('reportAnonymous');

const searchReports = document.getElementById('searchReports');
const filterStatus = document.getElementById('filterStatus');

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
    const session = await getSession();
    if (!session.authenticated) {
        window.location.href = '/login/';
        return;
    }

    currentUser = session.user;

    renderUser();
    bindEvents();
    await fetchReports();
    setInterval(fetchReports, 60_000);
}

// ─── USER DISPLAY ─────────────────────────────────────────────
function renderUser() {
    const name = currentUser.fullname || currentUser.email || 'Utilisateur';
    document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
    document.getElementById('userName').textContent = name;
    document.getElementById('userEmail').textContent = currentUser.email;
}

// ─── EVENTS ───────────────────────────────────────────────────
function bindEvents() {
    // Modal
    document.getElementById('btnCreateReport').addEventListener('click', openModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('formCancel').addEventListener('click', closeModal);
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });

    // Form
    reportForm.addEventListener('submit', handleCreateReport);
    reportDescription.addEventListener('input', updateCharCount);

    // File drop
    fileDrop.addEventListener('click', () => fileInput.click());
    fileDrop.addEventListener('dragover', e => {
        e.preventDefault();
        fileDrop.classList.add('active');
    });
    fileDrop.addEventListener('dragleave', () => {
        fileDrop.classList.remove('active');
    });
    fileDrop.addEventListener('drop', e => {
        e.preventDefault();
        fileDrop.classList.remove('active');
        handleFileDrop(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', e => {
        handleFileDrop(e.target.files);
    });

    // Search & filter
    searchReports.addEventListener('input', e => {
        searchQuery = e.target.value.toLowerCase();
        applyFilters();
    });
    filterStatus.addEventListener('change', e => {
        filteredStatus = e.target.value;
        applyFilters();
    });

    // Logout
    document.getElementById('btnLogout').addEventListener('click', async () => {
        await logout();
        window.location.href = '/login/';
    });
}

// ─── MODAL ────────────────────────────────────────────────────
function openModal() {
    modal.classList.remove('hidden');
    reportForm.reset();
    filesToUpload = [];
    renderFilesList();
    updateCharCount();
}

function closeModal() {
    modal.classList.add('hidden');
    reportForm.reset();
    filesToUpload = [];
}

// ─── FILES ────────────────────────────────────────────────────
function handleFileDrop(files) {
    for (const file of files) {
        if (!validateFile(file)) continue;
        if (filesToUpload.length >= 5) {
            showToast('Maximum 5 fichiers autorisés', 'warning');
            break;
        }
        filesToUpload.push(file);
    }
    renderFilesList();
}

function validateFile(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain'];
    if (!allowed.includes(file.type)) {
        showToast(`Type non autorisé: ${file.name}`, 'error');
        return false;
    }
    if (file.size > 10 * 1024 * 1024) {
        showToast(`Fichier trop volumineux: ${file.name}`, 'error');
        return false;
    }
    return true;
}

function renderFilesList() {
    filesList.innerHTML = filesToUpload.map((file, idx) => `
        <li class="file-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
            <span class="file-item-name">${escapeHtml(file.name)}</span>
            <span class="file-item-size">${formatFileSize(file.size)}</span>
            <button type="button" class="file-item-remove" onclick="window.removeFile(${idx})">✕</button>
        </li>
    `).join('');
}

window.removeFile = (idx) => {
    filesToUpload.splice(idx, 1);
    renderFilesList();
};

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
}

// ─── FORM VALIDATION ──────────────────────────────────────────
function updateCharCount() {
    const len = reportDescription.value.length;
    document.getElementById('charCount').textContent = len;
}

// ─── CREATE REPORT ────────────────────────────────────────────
async function handleCreateReport(e) {
    e.preventDefault();

    const title = reportTitle.value.trim();
    const category = reportCategory.value;
    const description = reportDescription.value.trim();
    const isAnonymous = reportAnonymous.checked;

    if (!title || !category || !description) {
        showToast('Tous les champs obligatoires doivent être remplis', 'warning');
        return;
    }

    const btn = reportForm.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Création...';

    try {
        const formData = new FormData();
        formData.append('title', title);
        formData.append('category', category);
        formData.append('description', description);
        formData.append('is_anonymous', isAnonymous);

        for (const file of filesToUpload) {
            formData.append('attachments', file);
        }

        const res = await fetch('/api/reports', {
            method: 'POST',
            body: formData,
            credentials: 'include',
        });

        if (!res.ok) {
            const err = await res.json();
            showToast(err.error || 'Erreur lors de la création', 'error');
            return;
        }

        const data = await res.json();
        showToast(`✅ Signalement créé (${data.tracking_code})`, 'success');
        closeModal();
        await fetchReports();
    } catch (err) {
        console.error(err);
        showToast('Erreur réseau', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ─── FETCH REPORTS ────────────────────────────────────────────
async function fetchReports() {
    try {
        const data = await apiFetch('/api/reports?limit=100');
        allReports = data.reports || [];
        applyFilters();
        updateStats();
    } catch (err) {
        console.error(err);
        showToast('Impossible de charger les signalements', 'error');
    }
}

// ─── APPLY FILTERS ────────────────────────────────────────────
function applyFilters() {
    let result = [...allReports];

    if (searchQuery) {
        result = result.filter(r =>
            (r.tracking_code || '').toLowerCase().includes(searchQuery) ||
            (r.title || '').toLowerCase().includes(searchQuery)
        );
    }

    if (filteredStatus) {
        result = result.filter(r => r.status === filteredStatus);
    }

    filtered = result;
    renderReports();
}

// ─── RENDER REPORTS ───────────────────────────────────────────
function renderReports() {
    if (filtered.length === 0) {
        reportsList.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    reportsList.innerHTML = filtered.map(r => `
        <div class="report-item" onclick="window.viewReport(${r.id})">
            <div class="report-item-header">
                <div class="report-item-info">
                    <div class="report-item-code">${escapeHtml(r.tracking_code)}</div>
                    <div class="report-item-title">${escapeHtml(r.title)}</div>
                    <div class="report-item-category">${escapeHtml(r.category)}</div>
                </div>
                <div class="report-item-status status-${r.status}">
                    ${formatStatus(r.status)}
                </div>
            </div>
            <div class="report-item-footer">
                <div class="report-item-date">
                    <span>Créé: ${fmtDate(r.created_at)}</span>
                    ${r.updated_at ? `<span>Mis à jour: ${fmtDate(r.updated_at)}</span>` : ''}
                </div>
                <div class="report-item-arrow">→</div>
            </div>
        </div>
    `).join('');
}

window.viewReport = (id) => {
    // TODO: Implémenter un drawer de détail
    console.log('View report', id);
    showToast('Détail du signalement à venir', 'info');
};

// ─── STATS ────────────────────────────────────────────────────
function updateStats() {
    const stats = {
        total: allReports.length,
        open: 0,
        in_progress: 0,
        waiting_info: 0,
        closed: 0,
    };

    for (const r of allReports) {
        if (r.status === 'open') stats.open++;
        else if (r.status === 'in_progress') stats.in_progress++;
        else if (r.status === 'waiting_info') stats.waiting_info++;
        else if (r.status.startsWith('closed')) stats.closed++;
    }

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statOpen').textContent = stats.open;
    document.getElementById('statProgress').textContent = stats.in_progress;
    document.getElementById('statWaiting').textContent = stats.waiting_info;
    document.getElementById('statClosed').textContent = stats.closed;
}

// ─── HELPERS ──────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-msg">${escapeHtml(message)}</span>
        <button class="toast-close" type="button">✕</button>
    `;
    toastContainer.appendChild(t);
    t.querySelector('.toast-close').addEventListener('click', () => {
        t.classList.add('toast-out');
        t.addEventListener('animationend', () => t.remove(), { once: true });
    });
    setTimeout(() => {
        if (t.parentNode) {
            t.classList.add('toast-out');
            t.addEventListener('animationend', () => t.remove(), { once: true });
        }
    }, 4000);
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[m]);
}

function formatStatus(status) {
    const labels = {
        open: 'Ouvert',
        in_progress: 'En cours',
        waiting_info: 'En attente',
        closed_founded: 'Clôturé (fondé)',
        closed_unfounded: 'Clôturé (non fondé)',
    };
    return labels[status] || status;
}

function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
}
