// electron/renderer/renderer.js
'use strict';

// ─── Guard: ensure we're running inside Electron ─────────────────────────
if (!window.electronAPI) {
    document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:20px;font-family:Inter,sans-serif;background:#0f0f13;color:#e2e2f0;padding:40px;text-align:center;">
            <div style="font-size:48px">⚠️</div>
            <h1 style="font-size:22px;font-weight:700;color:#f87171">Not running in Electron</h1>
            <p style="color:#8888aa;max-width:480px;line-height:1.7">
                This file must be launched via the Electron runtime, not opened directly in a browser.<br><br>
                <strong style="color:#e2e2f0">Run this command in your terminal:</strong>
            </p>
            <code style="background:#17171f;border:1px solid #2a2a3a;border-radius:8px;padding:14px 24px;font-size:15px;color:#a594ff;letter-spacing:0.3px">npm run electron:dev</code>
        </div>`;
    throw new Error('window.electronAPI not found — app must run inside Electron.');
}


let isAuthenticated = false;
let availableNotebooks = [];
let exportOutputDir = null;
let unsubscribeEvents = null;
let exportMode = 'list'; // 'list' or 'link'

// ─── DOM refs ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const navLogin       = $('nav-login');
const navExport      = $('nav-export');
const viewLogin      = $('view-login');
const viewExport     = $('view-export');
const badgeDot       = $('badge-dot');
const badgeLabel     = $('badge-label');
const badgeUser      = $('badge-user');
const badgeSince     = $('badge-since');

const emailInput     = $('email');
const passwordInput  = $('password');
const notheadless    = $('notheadless');
const btnLogin       = $('btn-login');
const btnLoginLabel  = $('btn-login-label');
const btnManualLogin = $('btn-manual-login');
const btnLogout      = $('btn-logout');
const logoutSection  = $('logout-section');
const loginLog       = $('login-log');
const loginLogClear  = $('login-log-clear');

const notebookSelect         = $('notebook-select');
const btnRefresh             = $('btn-refresh-notebooks');
const tabList                = $('tab-list');
const tabLink                = $('tab-link');
const sectionList            = $('section-list');
const sectionLink            = $('section-link');
const notebookLinkInput      = $('notebook-link');
const exportDirectory        = $('export-directory');
const btnSelectDirectory     = $('btn-select-directory');
const exportNotheadless      = $('export-notheadless');
const exportNopassasked      = $('export-nopassasked');
const exportTimeoutSelect    = $('export-timeout');
const progressCard           = $('progress-card');
const progressBar            = $('progress-bar');
const progressLabel          = $('progress-label');
const progressCounts         = $('progress-counts');
const btnExport              = $('btn-export');
const btnOpenOutput          = $('btn-open-output');
const exportLog              = $('export-log');
const exportLogClear         = $('export-log-clear');

const otcModal    = $('otc-modal');
const otcInput    = $('otc-input');
const otcSubmit   = $('otc-submit');
const lockModal   = $('lock-modal');
const lockSection = $('lock-section-name');
const lockConfirm = $('lock-confirm');
const manualModal = $('manual-modal');
const manualConfirm = $('manual-confirm');

// ─── Utility ─────────────────────────────────────────────────────────────

function now() {
    return new Date().toTimeString().split(' ')[0];
}

function appendLog(container, level, message) {
    const line = document.createElement('div');
    line.className = 'log-line';

    const ts = document.createElement('span');
    ts.className = 'log-ts';
    ts.textContent = now();

    const lv = document.createElement('span');
    lv.className = `log-level log-level-${level}`;
    lv.textContent = `[${level.toUpperCase()}]`;

    const msg = document.createElement('span');
    msg.className = 'log-msg';
    msg.textContent = message;

    line.append(ts, lv, msg);
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
}

// Human-friendly login time: "today at 07:35" or "Mar 22 at 07:35"
function formatLoginTime(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    if (isToday) return `today at ${time}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
}

function setAuthStatus(authenticated, checking = false, email = null, loginTime = null) {
    isAuthenticated = !!authenticated;
    badgeDot.className = `badge-dot ${checking ? 'checking' : authenticated ? 'authenticated' : 'unauthenticated'}`;
    badgeLabel.textContent = checking ? 'Checking…' : authenticated ? 'Logged in' : 'Not logged in';

    if (authenticated && email) {
        badgeUser.textContent = email;
        badgeSince.textContent = loginTime ? `since ${formatLoginTime(loginTime)}` : '';
    } else {
        badgeUser.textContent = '';
        badgeSince.textContent = '';
    }

    navExport.disabled = !authenticated;

    // Update Login page UI
    btnLoginLabel.textContent = authenticated ? 'Login as a different user' : 'Login';
    logoutSection.style.display = authenticated ? '' : 'none';
}

function switchView(name) {
    viewLogin.classList.toggle('active', name === 'login');
    viewExport.classList.toggle('active', name === 'export');
    navLogin.classList.toggle('active', name === 'login');
    navExport.classList.toggle('active', name === 'export');
}

// ─── Navigation ───────────────────────────────────────────────────────────

navLogin.addEventListener('click', () => switchView('login'));
navExport.addEventListener('click', () => {
    if (!navExport.disabled) {
        switchView('export');
        // Only auto-load if not already loaded/loading
        if (availableNotebooks.length === 0 && !_notebooksLoading) loadNotebooks();
    }
});

// ─── Auth check on startup ────────────────────────────────────────────────

async function checkAuthStatus() {
    setAuthStatus(false, true);
    try {
        const { isAuthenticated: auth, email, loginTime } = await window.electronAPI.invoke('check-auth');
        setAuthStatus(auth, false, email, loginTime);
    } catch (e) {
        setAuthStatus(false);
    }
}

// ─── Subscribe to main-process streaming events ──────────────────────────

function subscribeToEvents(logContainer) {
    if (unsubscribeEvents) unsubscribeEvents();

    unsubscribeEvents = window.electronAPI.onMainEvent(({ type, payload }) => {
        switch (type) {
            case 'log':
                appendLog(logContainer, payload.level, payload.message);
                break;

            case 'otc-required':
                otcInput.value = '';
                otcModal.classList.remove('hidden');
                otcInput.focus();
                break;

            case 'manual-login-ready':
                manualModal.classList.remove('hidden');
                break;

            case 'section-locked':
                lockSection.textContent = `Section: "${payload.sectionName}"`;
                lockModal.classList.remove('hidden');
                break;

            case 'progress':
                progressCard.style.display = '';
                progressLabel.textContent = `Exporting: ${payload.pageName}`;
                progressCounts.textContent = `${payload.totalPages} pages · ${payload.totalAssets} assets`;
                progressBar.classList.remove('indeterminate');
                break;

            case 'export-complete':
                progressBar.style.width = '100%';
                progressLabel.textContent = '✓ Export complete!';
                progressCounts.textContent = `${payload.totalPages} pages · ${payload.totalAssets} assets`;
                exportOutputDir = payload.outputDir;
                btnOpenOutput.style.display = '';
                appendLog(logContainer, 'success', `Done! Output: ${payload.outputDir}`);
                btnExport.disabled = false;
                btnExport.textContent = '📤 Start Export';
                break;

            case 'export-error':
                progressLabel.textContent = '✗ Export failed';
                progressBar.style.background = 'var(--error)';
                appendLog(logContainer, 'error', payload.error);
                btnExport.disabled = false;
                btnExport.textContent = '📤 Start Export';
                break;
        }
    });
}

// ─── Login ────────────────────────────────────────────────────────────────

async function doLogin(credentials) {
    btnLogin.disabled = true;
    btnManualLogin.disabled = true;
    btnLogin.innerHTML = '<span class="btn-icon">⏳</span> Logging in…';
    subscribeToEvents(loginLog);

    try {
        const result = await window.electronAPI.invoke('start-login', credentials);

        if (result && result.success) {
            appendLog(loginLog, 'success', 'Authentication successful!');
            // result.email and result.loginTime come from loginForElectron
            setAuthStatus(true, false, result.email || credentials?.login || null, result.loginTime);
            // Automatically switch to export and load notebooks
            switchView('export');
            await loadNotebooks();
        } else {
            appendLog(loginLog, 'error', result?.error || 'Login failed. Check your credentials.');
            setAuthStatus(false);
        }
    } catch (e) {
        appendLog(loginLog, 'error', `Unexpected error: ${e.message}`);
        setAuthStatus(false);
    } finally {
        btnLogin.disabled = false;
        btnManualLogin.disabled = false;
        btnLogin.innerHTML = '<span class="btn-icon">🔑</span> Login';
        if (unsubscribeEvents) { unsubscribeEvents(); unsubscribeEvents = null; }
    }
}

btnLogin.addEventListener('click', () => {
    const email    = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
        appendLog(loginLog, 'warn', 'Please enter both email and password for automated login.');
        return;
    }
    doLogin({ login: email, password, notheadless: notheadless.checked });
});

btnManualLogin.addEventListener('click', () => {
    doLogin({ notheadless: true }); // no credentials = manual flow
});

loginLogClear.addEventListener('click', () => { loginLog.innerHTML = ''; });

// ─── Logout ───────────────────────────────────────────────────────────────

btnLogout.addEventListener('click', async () => {
    btnLogout.disabled = true;
    btnLogout.textContent = 'Logging out…';
    try {
        await window.electronAPI.invoke('logout');
        setAuthStatus(false);
        availableNotebooks = [];
        notebookSelect.innerHTML = '<option value="">— Loading notebooks… —</option>';
        _notebooksLoading = false;
        switchView('login');
        appendLog(loginLog, 'info', 'Logged out successfully.');
    } catch (e) {
        appendLog(loginLog, 'error', `Logout failed: ${e.message}`);
    } finally {
        btnLogout.disabled = false;
        btnLogout.textContent = '🚪 Logout';
    }
});

// ─── OTC modal ────────────────────────────────────────────────────────────

otcSubmit.addEventListener('click', () => {
    const code = otcInput.value.trim();
    if (!code) return;
    otcModal.classList.add('hidden');
    window.electronAPI.send('otc-reply', code);
});

otcInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') otcSubmit.click();
});

// ─── Manual login modal ───────────────────────────────────────────────────

manualConfirm.addEventListener('click', () => {
    manualModal.classList.add('hidden');
    window.electronAPI.send('manual-login-confirmed');
});

// ─── Section lock modal ───────────────────────────────────────────────────

lockConfirm.addEventListener('click', () => {
    lockModal.classList.add('hidden');
    window.electronAPI.send('section-unlocked');
});

// ─── Notebooks ────────────────────────────────────────────────────────────

let _notebooksLoading = false;

async function loadNotebooks() {
    if (_notebooksLoading) return; // already in flight — don't open a second browser
    _notebooksLoading = true;

    notebookSelect.innerHTML = '<option>Loading…</option>';
    notebookSelect.disabled = true;
    btnExport.disabled = true;
    appendLog(exportLog, 'info', 'Fetching notebook list…');

    try {
        const { success, notebooks, error } = await window.electronAPI.invoke('list-notebooks');

        if (success && notebooks.length > 0) {
            availableNotebooks = notebooks;
            notebookSelect.innerHTML = notebooks.map(nb =>
                `<option value="${escapeAttr(nb.name)}">${escapeHtml(nb.name)}</option>`
            ).join('');
            notebookSelect.disabled = false;
            btnExport.disabled = false;
            appendLog(exportLog, 'success', `Found ${notebooks.length} notebook(s).`);
        } else {
            notebookSelect.innerHTML = '<option>No notebooks found</option>';
            appendLog(exportLog, 'warn', error || 'No notebooks found — are you logged in?');
        }
    } catch (e) {
        notebookSelect.innerHTML = '<option>Error loading notebooks</option>';
        appendLog(exportLog, 'error', `Failed to load notebooks: ${e.message}`);
    } finally {
        _notebooksLoading = false;
    }
}

btnRefresh.addEventListener('click', loadNotebooks);

tabList.addEventListener('click', () => {
    exportMode = 'list';
    tabList.classList.add('active');
    tabLink.classList.remove('active');
    sectionList.style.display = '';
    sectionLink.style.display = 'none';
    // Enable export button only if a notebook is available in the select
    btnExport.disabled = !notebookSelect.value;
});

tabLink.addEventListener('click', () => {
    exportMode = 'link';
    tabLink.classList.add('active');
    tabList.classList.remove('active');
    sectionList.style.display = 'none';
    sectionLink.style.display = '';
    // Always enable when switching to Link mode (validation happens on click)
    btnExport.disabled = false;
});

btnSelectDirectory.addEventListener('click', async () => {
    const current = exportDirectory.value;
    const selected = await window.electronAPI.invoke('select-directory', current);
    if (selected) {
        exportDirectory.value = selected;
    }
});

// ─── Export ───────────────────────────────────────────────────────────────

btnExport.addEventListener('click', async () => {
    let notebook = null;
    let notebookLink = null;

    if (exportMode === 'list') {
        notebook = notebookSelect.value;
        if (!notebook) {
            appendLog(exportLog, 'warn', 'Please select a notebook first.');
            return;
        }
    } else {
        notebookLink = notebookLinkInput.value.trim();
        if (!notebookLink) {
            appendLog(exportLog, 'warn', 'Please enter a notebook URL.');
            return;
        }
        if (!notebookLink.startsWith('http')) {
            appendLog(exportLog, 'warn', 'Please enter a valid URL starting with http:// or https://');
            return;
        }
    }

    btnExport.disabled = true;
    btnExport.innerHTML = '<span class="btn-icon">⏳</span> Exporting…';
    btnOpenOutput.style.display = 'none';
    progressCard.style.display = '';
    progressBar.style.width = '0%';
    progressBar.style.background = '';
    progressBar.classList.add('indeterminate');
    progressLabel.textContent = 'Starting…';
    progressCounts.textContent = '0 pages · 0 assets';

    subscribeToEvents(exportLog);

    await window.electronAPI.invoke('start-export', {
        notebook,
        notebookLink,
        exportDir: exportDirectory.value,
        notheadless: exportNotheadless.checked,
        nopassasked: exportNopassasked.checked,
        downloadTimeout: parseInt(exportTimeoutSelect.value, 10) || 60000
    });

    // export-complete / export-error events will re-enable the button
});

exportLogClear.addEventListener('click', () => { exportLog.innerHTML = ''; });

btnOpenOutput.addEventListener('click', async () => {
    if (!exportOutputDir) return;
    try {
        const result = await window.electronAPI.invoke('open-output-folder', exportOutputDir);
        if (result && !result.success) {
            appendLog(exportLog, 'warn', `Could not open folder directly: ${result.error || 'Unknown error'}. It might have been revealed instead.`);
        }
    } catch (e) {
        appendLog(exportLog, 'error', `Failed to open folder: ${e.message}`);
    }
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;');
}

// ─── Init ─────────────────────────────────────────────────────────────────

checkAuthStatus();

async function initExportDir() {
    if (exportDirectory) {
        exportDirectory.value = await window.electronAPI.invoke('get-default-directory');
    }
}
initExportDir();

appendLog(loginLog, 'info', 'OneNote Exporter ready. Login to get started.');
