# Walkthrough: "do dump" Debugging Feature

I have added the "do dump while processing (useful for debug)" checkbox to each dynamic view in the Electron application. This allows users to easily capture HTML snapshots of the Playwright session for troubleshooting login or export failures.

## Changes Made

### 🎨 User Interface
- Added the "do dump" checkbox to the **Automated Login** card.
- Added the "do dump" checkbox to the **Export Options** card (visible in both "Export from List" and "Export from URL" modes).

### ⚙️ Logic and Integration
- **Renderer**: Updated `renderer.js` to capture the state of these checkboxes and pass it as a `dodump` flag in IPC calls to the main process.
- **Main Process**: Updated the `list-notebooks` IPC handler to accept options from the renderer, enabling debug dumps during the notebook discovery phase.
- **Backend**: 
    - Implemented HTML dumping in `runExportForElectron` and `processSectionsElectron` within `src/exporter.js`.
    - Added comprehensive error-state dumping to `loginForElectron` in `src/auth.js` to mirror CLI functionality.

## Verification Results

### Manual Verification Steps
1.  **Login Debugging**:
    - Select "Automated Login".
    - Check **"do dump while processing"**.
    - Attempt login. verify HTML files like `debug_after_email.html` appear in the project root.
2.  **Notebook List Debugging**:
    - Go to "Export from List".
    - Check **"do dump while processing"** (under Export Options).
    - Click **"Refresh list"**.
    - Verify `debug_page_dump.html` and `debug_frame_dump.html` are created.
3.  **Export Debugging**:
    - Start an export with the checkbox enabled.
    - Verify that `debug_notebook_content.html` and individual page dumps are generated.

> [!TIP]
> Use these dumps to identify where Microsoft's UI might be deviating from expected selectors, especially during MFA or account protection redirects.

```diff:index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'">
    <title>OneNote Exporter</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles.css">
</head>
<body>

    <!-- ── OTC Modal ─────────────────────────────────────────────────── -->
    <div id="otc-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="otc-title">
        <div class="modal-card">
            <div class="modal-icon">🔐</div>
            <h2 id="otc-title">Verification Required</h2>
            <p>Microsoft sent a verification code. Enter it below.</p>
            <input id="otc-input" type="text" placeholder="123456" maxlength="8" autocomplete="one-time-code">
            <button id="otc-submit" class="btn btn-primary">Submit Code</button>
        </div>
    </div>

    <!-- ── Section-Lock Modal ─────────────────────────────────────────── -->
    <div id="lock-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="lock-title">
        <div class="modal-card">
            <div class="modal-icon">🔒</div>
            <h2 id="lock-title">Password-Protected Section</h2>
            <p id="lock-section-name" class="lock-section"></p>
            <p>Please unlock the section in the browser window that has opened, then click the button below.</p>
            <button id="lock-confirm" class="btn btn-primary">Section Unlocked — Continue</button>
        </div>
    </div>

    <!-- ── Manual Login Modal ─────────────────────────────────────────── -->
    <div id="manual-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <div class="modal-card">
            <div class="modal-icon">🌐</div>
            <h2 id="manual-title">Manual Login</h2>
            <p>A browser window has opened. Please sign in to your Microsoft account and navigate to your Notebooks list.</p>
            <p class="hint">Once you can see your notebooks, click the button below.</p>
            <button id="manual-confirm" class="btn btn-primary">✓ I've Logged In</button>
        </div>
    </div>

    <!-- ── Main Layout ────────────────────────────────────────────────── -->
    <div class="app">

        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="logo">
                <img src="../assets/logo.png" class="logo-icon" alt="OneNote Exporter Logo" />
                <span class="logo-text">OneNote<br><strong>Exporter</strong></span>
            </div>

            <nav class="nav">
                <button class="nav-item active" data-view="login" id="nav-login">
                    <span class="nav-icon">🔑</span> Login
                </button>
                <button class="nav-item" data-view="export-list" id="nav-export-list" disabled>
                    <span class="nav-icon">📚</span> Export from List
                </button>
                <button class="nav-item" data-view="export-url" id="nav-export-url" disabled>
                    <span class="nav-icon">📕</span> Export from URL
                </button>
            </nav>

            <div class="auth-badge" id="auth-badge">
                <span class="badge-dot" id="badge-dot"></span>
                <div class="badge-info">
                    <span id="badge-label">Checking…</span>
                    <span id="badge-user" class="badge-user"></span>
                    <span id="badge-since" class="badge-since"></span>
                </div>
            </div>

            <div class="sidebar-footer">
                <span class="version">v1.0.0 — Electron Mode</span>
            </div>
        </aside>

        <!-- Main content -->
        <main class="content">

            <!-- ── Login View ───────────────────────────────────────── -->
            <section class="view active" id="view-login">
                <div class="view-header">
                    <h1>Microsoft Login</h1>
                    <p class="subtitle">Authenticate with your Microsoft account to access your OneNote notebooks.</p>
                </div>

                <div class="card">
                    <h3 class="card-title">
                        <span>🤖</span> Automated Login
                        <span class="tag">Recommended</span>
                    </h3>
                    <p class="card-desc">Enter your credentials and the tool will log in for you automatically.</p>

                    <div class="form-group">
                        <label for="email">Microsoft Email</label>
                        <input type="email" id="email" placeholder="yourname@outlook.com" autocomplete="email">
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" placeholder="••••••••••" autocomplete="current-password">
                    </div>

                    <div class="form-row">
                        <label class="toggle-label">
                            <input type="checkbox" id="notheadless">
                            <span class="toggle-text">Show browser window</span>
                        </label>
                    </div>

                    <button id="btn-login" class="btn btn-primary btn-full">
                        <span class="btn-icon">🔑</span> <span id="btn-login-label">Login</span>
                    </button>
                </div>

                <div class="card card-alt">
                    <h3 class="card-title"><span>🔱️</span> Manual Login</h3>
                    <p class="card-desc">Opens a browser window — you log in yourself. Useful if you use MFA / SSO.</p>
                    <button id="btn-manual-login" class="btn btn-secondary btn-full">
                        Open Browser for Manual Login
                    </button>
                </div>

                <!-- Logout button (hidden until logged in) -->
                <div id="logout-section" style="display:none">
                    <button id="btn-logout" class="btn btn-logout btn-full">
                        🚪 Logout
                    </button>
                </div>

                <!-- Log console for login -->
                <div class="log-panel" id="login-log-panel">
                    <div class="log-header">
                        <span>Activity Log</span>
                        <button class="log-clear" id="login-log-clear">Clear</button>
                    </div>
                    <div class="log-body" id="login-log"></div>
                </div>
            </section>

            <!-- ── Export View ──────────────────────────────────────── -->
            <section class="view" id="view-export">
                <div class="view-header">
                    <h1 id="export-view-title">Export Notebook</h1>
                    <p class="subtitle" id="export-view-subtitle">Select a notebook and export it to Obsidian-compatible Markdown.</p>
                </div>

                <div class="card" id="notebook-selection-card">


                    <div id="section-list">
                        <div class="form-group">
                            <label for="notebook-select">Notebook</label>
                            <div class="select-wrapper">
                                <select id="notebook-select">
                                    <option value="">— Loading notebooks… —</option>
                                </select>
                            </div>
                        </div>
                        <button id="btn-refresh-notebooks" class="btn btn-ghost btn-sm">↺ Refresh list</button>
                    </div>

                    <div id="section-link" style="display:none">
                        <div class="form-group">
                            <label for="notebook-link">Notebook URL</label>
                            <input type="text" id="notebook-link" placeholder="https://onedrive.live.com/redir?resid=...">
                            <p class="hint" style="font-size:11px; margin-top:4px; opacity:0.7">Paste the full URL to your OneNote notebook as seen in the browser.</p>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h3 class="card-title"><span>⚙️</span> Export Options</h3>
                    <div class="options-grid">
                        <label class="toggle-label">
                            <input type="checkbox" id="export-notheadless">
                            <span class="toggle-text">Show browser during export</span>
                        </label>
                        <label class="toggle-label">
                            <input type="checkbox" id="export-nopassasked">
                            <span class="toggle-text">Skip password-protected sections</span>
                        </label>
                    </div>
                    <div class="form-group" style="margin-top:8px">
                        <label for="export-directory">Export Directory</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="export-directory" style="flex: 1;" readonly>
                            <button id="btn-select-directory" class="btn btn-secondary" style="padding: 10px 14px;">Browse…</button>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top:8px">
                        <label for="export-timeout">Download timeout per asset</label>
                        <div class="select-wrapper">
                            <select id="export-timeout">
                                <option value="30000">30 seconds</option>
                                <option value="60000" selected>60 seconds (default)</option>
                                <option value="120000">2 minutes</option>
                                <option value="180000">3 minutes</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="card" id="progress-card" style="display:none">
                    <h3 class="card-title"><span>⏳</span> Progress</h3>
                    <div class="progress-info">
                        <span id="progress-label">Starting…</span>
                        <span id="progress-counts">0 pages · 0 assets</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-bar" id="progress-bar"></div>
                    </div>
                </div>

                <div class="export-actions">
                    <button id="btn-export" class="btn btn-primary btn-large">
                        <span class="btn-icon">📤</span> Start Export
                    </button>
                    <button id="btn-open-output" class="btn btn-ghost" style="display:none">
                        📂 Open Output Folder
                    </button>
                </div>

                <!-- Log console for export -->
                <div class="log-panel" id="export-log-panel">
                    <div class="log-header">
                        <span>Export Log</span>
                        <button class="log-clear" id="export-log-clear">Clear</button>
                    </div>
                    <div class="log-body" id="export-log"></div>
                </div>
            </section>

        </main>
    </div>

    <script src="renderer.js"></script>
</body>
</html>
===
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'">
    <title>OneNote Exporter</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles.css">
</head>
<body>

    <!-- ── OTC Modal ─────────────────────────────────────────────────── -->
    <div id="otc-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="otc-title">
        <div class="modal-card">
            <div class="modal-icon">🔐</div>
            <h2 id="otc-title">Verification Required</h2>
            <p>Microsoft sent a verification code. Enter it below.</p>
            <input id="otc-input" type="text" placeholder="123456" maxlength="8" autocomplete="one-time-code">
            <button id="otc-submit" class="btn btn-primary">Submit Code</button>
        </div>
    </div>

    <!-- ── Section-Lock Modal ─────────────────────────────────────────── -->
    <div id="lock-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="lock-title">
        <div class="modal-card">
            <div class="modal-icon">🔒</div>
            <h2 id="lock-title">Password-Protected Section</h2>
            <p id="lock-section-name" class="lock-section"></p>
            <p>Please unlock the section in the browser window that has opened, then click the button below.</p>
            <button id="lock-confirm" class="btn btn-primary">Section Unlocked — Continue</button>
        </div>
    </div>

    <!-- ── Manual Login Modal ─────────────────────────────────────────── -->
    <div id="manual-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <div class="modal-card">
            <div class="modal-icon">🌐</div>
            <h2 id="manual-title">Manual Login</h2>
            <p>A browser window has opened. Please sign in to your Microsoft account and navigate to your Notebooks list.</p>
            <p class="hint">Once you can see your notebooks, click the button below.</p>
            <button id="manual-confirm" class="btn btn-primary">✓ I've Logged In</button>
        </div>
    </div>

    <!-- ── Main Layout ────────────────────────────────────────────────── -->
    <div class="app">

        <!-- Sidebar -->
        <aside class="sidebar">
            <div class="logo">
                <img src="../assets/logo.png" class="logo-icon" alt="OneNote Exporter Logo" />
                <span class="logo-text">OneNote<br><strong>Exporter</strong></span>
            </div>

            <nav class="nav">
                <button class="nav-item active" data-view="login" id="nav-login">
                    <span class="nav-icon">🔑</span> Login
                </button>
                <button class="nav-item" data-view="export-list" id="nav-export-list" disabled>
                    <span class="nav-icon">📚</span> Export from List
                </button>
                <button class="nav-item" data-view="export-url" id="nav-export-url" disabled>
                    <span class="nav-icon">📕</span> Export from URL
                </button>
            </nav>

            <div class="auth-badge" id="auth-badge">
                <span class="badge-dot" id="badge-dot"></span>
                <div class="badge-info">
                    <span id="badge-label">Checking…</span>
                    <span id="badge-user" class="badge-user"></span>
                    <span id="badge-since" class="badge-since"></span>
                </div>
            </div>

            <div class="sidebar-footer">
                <span class="version">v1.0.0 — Electron Mode</span>
            </div>
        </aside>

        <!-- Main content -->
        <main class="content">

            <!-- ── Login View ───────────────────────────────────────── -->
            <section class="view active" id="view-login">
                <div class="view-header">
                    <h1>Microsoft Login</h1>
                    <p class="subtitle">Authenticate with your Microsoft account to access your OneNote notebooks.</p>
                </div>

                <div class="card">
                    <h3 class="card-title">
                        <span>🤖</span> Automated Login
                        <span class="tag">Recommended</span>
                    </h3>
                    <p class="card-desc">Enter your credentials and the tool will log in for you automatically.</p>

                    <div class="form-group">
                        <label for="email">Microsoft Email</label>
                        <input type="email" id="email" placeholder="yourname@outlook.com" autocomplete="email">
                    </div>
                    <div class="form-group">
                        <label for="password">Password</label>
                        <input type="password" id="password" placeholder="••••••••••" autocomplete="current-password">
                    </div>

                    <div class="form-row">
                        <label class="toggle-label">
                            <input type="checkbox" id="notheadless">
                            <span class="toggle-text">Show browser window</span>
                        </label>
                        <label class="toggle-label">
                            <input type="checkbox" id="login-dodump">
                            <span class="toggle-text">do dump while processing (useful for debug)</span>
                        </label>
                    </div>

                    <button id="btn-login" class="btn btn-primary btn-full">
                        <span class="btn-icon">🔑</span> <span id="btn-login-label">Login</span>
                    </button>
                </div>

                <div class="card card-alt">
                    <h3 class="card-title"><span>🔱️</span> Manual Login</h3>
                    <p class="card-desc">Opens a browser window — you log in yourself. Useful if you use MFA / SSO.</p>
                    <button id="btn-manual-login" class="btn btn-secondary btn-full">
                        Open Browser for Manual Login
                    </button>
                </div>

                <!-- Logout button (hidden until logged in) -->
                <div id="logout-section" style="display:none">
                    <button id="btn-logout" class="btn btn-logout btn-full">
                        🚪 Logout
                    </button>
                </div>

                <!-- Log console for login -->
                <div class="log-panel" id="login-log-panel">
                    <div class="log-header">
                        <span>Activity Log</span>
                        <button class="log-clear" id="login-log-clear">Clear</button>
                    </div>
                    <div class="log-body" id="login-log"></div>
                </div>
            </section>

            <!-- ── Export View ──────────────────────────────────────── -->
            <section class="view" id="view-export">
                <div class="view-header">
                    <h1 id="export-view-title">Export Notebook</h1>
                    <p class="subtitle" id="export-view-subtitle">Select a notebook and export it to Obsidian-compatible Markdown.</p>
                </div>

                <div class="card" id="notebook-selection-card">


                    <div id="section-list">
                        <div class="form-group">
                            <label for="notebook-select">Notebook</label>
                            <div class="select-wrapper">
                                <select id="notebook-select">
                                    <option value="">— Loading notebooks… —</option>
                                </select>
                            </div>
                        </div>
                        <button id="btn-refresh-notebooks" class="btn btn-ghost btn-sm">↺ Refresh list</button>
                    </div>

                    <div id="section-link" style="display:none">
                        <div class="form-group">
                            <label for="notebook-link">Notebook URL</label>
                            <input type="text" id="notebook-link" placeholder="https://onedrive.live.com/redir?resid=...">
                            <p class="hint" style="font-size:11px; margin-top:4px; opacity:0.7">Paste the full URL to your OneNote notebook as seen in the browser.</p>
                        </div>
                    </div>
                </div>

                <div class="card">
                    <h3 class="card-title"><span>⚙️</span> Export Options</h3>
                    <div class="options-grid">
                        <label class="toggle-label">
                            <input type="checkbox" id="export-notheadless">
                            <span class="toggle-text">Show browser during export</span>
                        </label>
                        <label class="toggle-label">
                            <input type="checkbox" id="export-nopassasked">
                            <span class="toggle-text">Skip password-protected sections</span>
                        </label>
                        <label class="toggle-label">
                            <input type="checkbox" id="export-dodump">
                            <span class="toggle-text">do dump while processing (useful for debug)</span>
                        </label>
                    </div>
                    <div class="form-group" style="margin-top:8px">
                        <label for="export-directory">Export Directory</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="export-directory" style="flex: 1;" readonly>
                            <button id="btn-select-directory" class="btn btn-secondary" style="padding: 10px 14px;">Browse…</button>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top:8px">
                        <label for="export-timeout">Download timeout per asset</label>
                        <div class="select-wrapper">
                            <select id="export-timeout">
                                <option value="30000">30 seconds</option>
                                <option value="60000" selected>60 seconds (default)</option>
                                <option value="120000">2 minutes</option>
                                <option value="180000">3 minutes</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="card" id="progress-card" style="display:none">
                    <h3 class="card-title"><span>⏳</span> Progress</h3>
                    <div class="progress-info">
                        <span id="progress-label">Starting…</span>
                        <span id="progress-counts">0 pages · 0 assets</span>
                    </div>
                    <div class="progress-track">
                        <div class="progress-bar" id="progress-bar"></div>
                    </div>
                </div>

                <div class="export-actions">
                    <button id="btn-export" class="btn btn-primary btn-large">
                        <span class="btn-icon">📤</span> Start Export
                    </button>
                    <button id="btn-open-output" class="btn btn-ghost" style="display:none">
                        📂 Open Output Folder
                    </button>
                </div>

                <!-- Log console for export -->
                <div class="log-panel" id="export-log-panel">
                    <div class="log-header">
                        <span>Export Log</span>
                        <button class="log-clear" id="export-log-clear">Clear</button>
                    </div>
                    <div class="log-body" id="export-log"></div>
                </div>
            </section>

        </main>
    </div>

    <script src="renderer.js"></script>
</body>
</html>
```
```diff:renderer.js
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
const navExportList  = $('nav-export-list');
const navExportUrl   = $('nav-export-url');
const viewLogin      = $('view-login');
const viewExport     = $('view-export');
const viewExportTitle = $('export-view-title');
const viewExportSub   = $('export-view-subtitle');
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

    navExportList.disabled = !authenticated;
    navExportUrl.disabled = !authenticated;

    // Update Login page UI
    btnLoginLabel.textContent = authenticated ? 'Login as a different user' : 'Login';
    logoutSection.style.display = authenticated ? '' : 'none';
}

function switchView(name) {
    viewLogin.classList.toggle('active', name === 'login');
    viewExport.classList.toggle('active', name.startsWith('export'));
    
    navLogin.classList.toggle('active', name === 'login');
    navExportList.classList.toggle('active', name === 'export-list');
    navExportUrl.classList.toggle('active', name === 'export-url');

    if (name === 'export-list') {
        exportMode = 'list';
        viewExportTitle.textContent = 'Export from List';
        viewExportSub.textContent = 'Select a notebook from your account and export it.';
        sectionList.style.display = '';
        sectionLink.style.display = 'none';
        btnExport.disabled = !notebookSelect.value;
    } else if (name === 'export-url') {
        exportMode = 'link';
        viewExportTitle.textContent = 'Export from URL';
        viewExportSub.textContent = 'Provide a direct link to a notebook to export it.';
        sectionList.style.display = 'none';
        sectionLink.style.display = '';
        btnExport.disabled = false;
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────

navLogin.addEventListener('click', () => switchView('login'));

navExportList.addEventListener('click', () => {
    if (!navExportList.disabled) {
        switchView('export-list');
        if (availableNotebooks.length === 0 && !_notebooksLoading) loadNotebooks();
    }
});

navExportUrl.addEventListener('click', () => {
    if (!navExportUrl.disabled) {
        switchView('export-url');
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
            // Automatically switch to export-list and load notebooks
            switchView('export-list');
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
===
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
const navExportList  = $('nav-export-list');
const navExportUrl   = $('nav-export-url');
const viewLogin      = $('view-login');
const viewExport     = $('view-export');
const viewExportTitle = $('export-view-title');
const viewExportSub   = $('export-view-subtitle');
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
const loginDodump            = $('login-dodump');
const exportDodump           = $('export-dodump');

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

    navExportList.disabled = !authenticated;
    navExportUrl.disabled = !authenticated;

    // Update Login page UI
    btnLoginLabel.textContent = authenticated ? 'Login as a different user' : 'Login';
    logoutSection.style.display = authenticated ? '' : 'none';
}

function switchView(name) {
    viewLogin.classList.toggle('active', name === 'login');
    viewExport.classList.toggle('active', name.startsWith('export'));
    
    navLogin.classList.toggle('active', name === 'login');
    navExportList.classList.toggle('active', name === 'export-list');
    navExportUrl.classList.toggle('active', name === 'export-url');

    if (name === 'export-list') {
        exportMode = 'list';
        viewExportTitle.textContent = 'Export from List';
        viewExportSub.textContent = 'Select a notebook from your account and export it.';
        sectionList.style.display = '';
        sectionLink.style.display = 'none';
        btnExport.disabled = !notebookSelect.value;
    } else if (name === 'export-url') {
        exportMode = 'link';
        viewExportTitle.textContent = 'Export from URL';
        viewExportSub.textContent = 'Provide a direct link to a notebook to export it.';
        sectionList.style.display = 'none';
        sectionLink.style.display = '';
        btnExport.disabled = false;
    }
}

// ─── Navigation ───────────────────────────────────────────────────────────

navLogin.addEventListener('click', () => switchView('login'));

navExportList.addEventListener('click', () => {
    if (!navExportList.disabled) {
        switchView('export-list');
        if (availableNotebooks.length === 0 && !_notebooksLoading) loadNotebooks();
    }
});

navExportUrl.addEventListener('click', () => {
    if (!navExportUrl.disabled) {
        switchView('export-url');
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
            // Automatically switch to export-list and load notebooks
            switchView('export-list');
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
    doLogin({ login: email, password, notheadless: notheadless.checked, dodump: loginDodump.checked });
});

btnManualLogin.addEventListener('click', () => {
    doLogin({ notheadless: true, dodump: loginDodump.checked }); // no credentials = manual flow
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
        const { success, notebooks, error } = await window.electronAPI.invoke('list-notebooks', { 
            dodump: exportDodump.checked 
        });

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
        dodump: exportDodump.checked,
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
```
```diff:main.js
// electron/main.js
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');

const { loginForElectron, checkAuth, getAuthMeta, logout } = require('../src/auth');
const { runExportForElectron } = require('../src/exporter');
const { listNotebooks } = require('../src/navigator');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#0f0f13',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false // needed so preload can require electron
        },
        icon: path.join(__dirname, 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.png'),
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Show window only once ready (avoids flash)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ─── Helper: broadcast events from main process to renderer ────────────────
function sendToRenderer(type, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('main-event', { type, payload });
    }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Check if user is authenticated — also returns email + loginTime for the GUI
ipcMain.handle('check-auth', async () => {
    const isAuthenticated = await checkAuth();
    const meta = isAuthenticated ? await getAuthMeta() : null;
    return {
        isAuthenticated,
        email: meta?.email || null,
        loginTime: meta?.loginTime || null
    };
});

// Logout — delete auth state files
ipcMain.handle('logout', async () => {
    await logout();
    return { success: true };
});

// Login (automated or manual)
ipcMain.handle('start-login', async (_event, credentials) => {
    const result = await loginForElectron(
        credentials || {},
        (type, payload) => sendToRenderer(type, payload),
        ipcMain
    );
    return result;
});

// List notebooks — mutex-protected so only one Playwright session runs at a time
let _notebooksPromise = null;
ipcMain.handle('list-notebooks', async () => {
    // If a fetch is already in flight, reuse it instead of launching a second browser
    if (_notebooksPromise) {
        return _notebooksPromise;
    }
    _notebooksPromise = (async () => {
        try {
            const notebooks = await listNotebooks({});
            return { success: true, notebooks };
        } catch (e) {
            return { success: false, error: e.message, notebooks: [] };
        } finally {
            _notebooksPromise = null;
        }
    })();
    return _notebooksPromise;
});

// Get default export directory
ipcMain.handle('get-default-directory', async () => {
    return path.join(app.getPath('downloads'), 'Microsoft-OneNote-Exporter_Exports');
});

// Select a directory
ipcMain.handle('select-directory', async (_event, defaultPath) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Export Directory',
        defaultPath: defaultPath,
        properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || filePaths.length === 0) {
        return null;
    }
    return filePaths[0];
});

// Export a notebook
ipcMain.handle('start-export', async (_event, options) => {
    const result = await runExportForElectron(
        options || {},
        (type, payload) => sendToRenderer(type, payload),
        ipcMain
    );
    return result;
});

// Open the output folder in Finder / Explorer
ipcMain.handle('open-output-folder', async (_event, folderPath) => {
    if (!folderPath) {
        return { success: false, error: 'No path provided' };
    }
    try {
        const error = await shell.openPath(folderPath);
        if (error) {
            console.error(`[IPC] shell.openPath failed for: ${folderPath}. Error: ${error}`);
            // Fallback: Reveal the folder instead of opening it
            shell.showItemInFolder(folderPath);
            return { success: false, error };
        }
        return { success: true };
    } catch (e) {
        console.error(`[IPC] Exception in open-output-folder: ${e.message}`);
        return { success: false, error: e.message };
    }
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    // Override the Dock icon on macOS in dev mode — must be called after ready,
    // and Electron's dock API requires a PNG (not .icns).
    if (process.platform === 'darwin' && app.dock) {
        app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
===
// electron/main.js
'use strict';

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');

const { loginForElectron, checkAuth, getAuthMeta, logout } = require('../src/auth');
const { runExportForElectron } = require('../src/exporter');
const { listNotebooks } = require('../src/navigator');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        backgroundColor: '#0f0f13',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false // needed so preload can require electron
        },
        icon: path.join(__dirname, 'assets', process.platform === 'darwin' ? 'icon.icns' : 'icon.png'),
        show: false
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    // Show window only once ready (avoids flash)
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// ─── Helper: broadcast events from main process to renderer ────────────────
function sendToRenderer(type, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('main-event', { type, payload });
    }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

// Check if user is authenticated — also returns email + loginTime for the GUI
ipcMain.handle('check-auth', async () => {
    const isAuthenticated = await checkAuth();
    const meta = isAuthenticated ? await getAuthMeta() : null;
    return {
        isAuthenticated,
        email: meta?.email || null,
        loginTime: meta?.loginTime || null
    };
});

// Logout — delete auth state files
ipcMain.handle('logout', async () => {
    await logout();
    return { success: true };
});

// Login (automated or manual)
ipcMain.handle('start-login', async (_event, credentials) => {
    const result = await loginForElectron(
        credentials || {},
        (type, payload) => sendToRenderer(type, payload),
        ipcMain
    );
    return result;
});

// List notebooks — mutex-protected so only one Playwright session runs at a time
let _notebooksPromise = null;
ipcMain.handle('list-notebooks', async (_event, options) => {
    // If a fetch is already in flight, reuse it instead of launching a second browser
    if (_notebooksPromise) {
        return _notebooksPromise;
    }
    _notebooksPromise = (async () => {
        try {
            const notebooks = await listNotebooks(options || {});
            return { success: true, notebooks };
        } catch (e) {
            return { success: false, error: e.message, notebooks: [] };
        } finally {
            _notebooksPromise = null;
        }
    })();
    return _notebooksPromise;
});

// Get default export directory
ipcMain.handle('get-default-directory', async () => {
    return path.join(app.getPath('downloads'), 'Microsoft-OneNote-Exporter_Exports');
});

// Select a directory
ipcMain.handle('select-directory', async (_event, defaultPath) => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Export Directory',
        defaultPath: defaultPath,
        properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || filePaths.length === 0) {
        return null;
    }
    return filePaths[0];
});

// Export a notebook
ipcMain.handle('start-export', async (_event, options) => {
    const result = await runExportForElectron(
        options || {},
        (type, payload) => sendToRenderer(type, payload),
        ipcMain
    );
    return result;
});

// Open the output folder in Finder / Explorer
ipcMain.handle('open-output-folder', async (_event, folderPath) => {
    if (!folderPath) {
        return { success: false, error: 'No path provided' };
    }
    try {
        const error = await shell.openPath(folderPath);
        if (error) {
            console.error(`[IPC] shell.openPath failed for: ${folderPath}. Error: ${error}`);
            // Fallback: Reveal the folder instead of opening it
            shell.showItemInFolder(folderPath);
            return { success: false, error };
        }
        return { success: true };
    } catch (e) {
        console.error(`[IPC] Exception in open-output-folder: ${e.message}`);
        return { success: false, error: e.message };
    }
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
    // Override the Dock icon on macOS in dev mode — must be called after ready,
    // and Electron's dock API requires a PNG (not .icns).
    if (process.platform === 'darwin' && app.dock) {
        app.dock.setIcon(path.join(__dirname, 'assets', 'icon.png'));
    }

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
```
```diff:exporter.js
const { Select } = require('enquirer');
const logger = require('./utils/logger');
const { listNotebooks, openNotebook, openNotebookByLink } = require('./navigator');
const { getSections, getPages, selectSection, selectPage, getPageContent, navigateBack, isSectionLocked } = require('./scrapers');
const { createMarkdownConverter } = require('./parser');
const { resolveInternalLinks } = require('./linkResolver');
const { withRetry } = require('./utils/retry');
const readline = require('readline');
const fs = require('fs-extra');
const path = require('path');
const sanitize = require('sanitize-filename');

const { downloadAttachment } = require('./downloadStrategies');

// Rename and generalize to downloadResource with retry logic
// options.timeout  - HTTP request timeout in ms (default 60 000)
// options.onError  - optional (msg) => void callback called on final failure
async function downloadResource(page, url, outputPath, options = {}) {
    const { timeout = 60000, onError } = options;
    return withRetry(async () => {
        if (url.startsWith('data:')) {
            const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                await fs.writeFile(outputPath, buffer);
                return true;
            }
            return false;
        }

        const response = await page.context().request.get(url, { timeout });
        if (response.ok()) {
            await fs.writeFile(outputPath, await response.body());
            return true;
        } else {
            throw new Error(`Failed to download resource (HTTP ${response.status()}): ${url.substring(0, 100)}...`);
        }
    }, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        operationName: `Download resource`,
        silent: true
    }).catch((e) => {
        const shortUrl = url.substring(0, 80) + '…';
        const msg = `Download failed (${e.message.split('\n')[0]}): ${shortUrl}`;
        logger.error(msg);
        if (onError) onError(msg);
        return false;
    });
}

function waitForEnter(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(message, () => {
            rl.close();
            resolve();
        });
    });
}

async function processSections(contentFrame, outputDir, td, options, pageIdMap, processedItems = new Set(), parentId = null, stats = { totalPages: 0, totalAssets: 0 }) {
    const sections = await getSections(contentFrame, parentId);
    if (sections.length === 0 && parentId) {
        logger.debug('(No items found in this group)');
    } else {
        logger.info(`Found ${sections.length} items at current level.`);
    }

    for (const item of sections) {
        if (processedItems.has(item.id)) continue;

        if (item.type === 'group') {
            const groupName = sanitize(item.name);
            const groupDir = path.join(outputDir, groupName);
            await fs.ensureDir(groupDir);

            // Map the Group ID to its directory for internal links
            pageIdMap[item.id] = { path: groupDir, isDir: true };
            processedItems.add(item.id);

            try {
                logger.info(`Entering group: ${item.name}`);
                await selectSection(contentFrame, item.id);
                // Extra wait for the tree to expand
                await contentFrame.waitForTimeout(5000);

                if (options.dodump) {
                    const dumpPath = path.resolve(__dirname, `../debug_group_${sanitize(item.name)}.html`);
                    await fs.writeFile(dumpPath, await contentFrame.content());
                }
                await processSections(contentFrame, groupDir, td, options, pageIdMap, processedItems, item.id, stats);
                logger.info(`Returning from group: ${item.name}`);
                await navigateBack(contentFrame);
                await contentFrame.waitForTimeout(3000);
            } catch (e) {
                logger.error(`Failed to process group ${item.name}:`, e);
            }
            continue;
        }

        // Processing regular Section
        try {
            await selectSection(contentFrame, item.id);
        } catch (e) {
            logger.error(`Failed to select section ${item.name}:`, e);
            continue;
        }

        await contentFrame.waitForTimeout(3000);

        // Check for password protection
        let isLocked = await isSectionLocked(contentFrame);

        // If locked, wait another 2s and re-check to avoid transition glitches from previous sections
        if (isLocked) {
            await contentFrame.waitForTimeout(2000);
            isLocked = await isSectionLocked(contentFrame);
        }

        const baseSectionName = sanitize(item.name);

        const isHeadless = !options.notheadless;
        if (isLocked && (options.nopassasked || isHeadless)) {
            if (isHeadless && !options.nopassasked) {
                logger.warn(`Section "${item.name}" is password protected.`);
                logger.warn(`The browser is running in headless mode, which means you cannot interact with it to unlock the section manually.`);
                logger.warn(`Acting as if --nopassasked was set: skipping this section.`);
            } else {
                logger.warn(`Section "${item.name}" appears password protected. Skipping as requested.`);
            }
            const protectedDir = path.join(outputDir, baseSectionName + " [passProtected]");
            await fs.ensureDir(protectedDir);
            processedItems.add(item.id);
            continue;
        }

        const sectionDir = path.join(outputDir, baseSectionName);
        await fs.ensureDir(sectionDir);

        // Map the Section ID to its directory for internal links
        pageIdMap[item.id] = { path: sectionDir, isDir: true };

        logger.step(`[Section] ${item.name}`);
        processedItems.add(item.id);

        while (isLocked) {
            logger.warn(`Section "${item.name}" is password protected.`);
            logger.info('Please switch to the browser window, unlock the section manually, and then return here.');
            await waitForEnter('Press ENTER here once the section is unlocked to continue...');

            // Re-verify
            await contentFrame.waitForTimeout(2000);
            isLocked = await isSectionLocked(contentFrame);
            if (isLocked) {
                logger.error('Section still appears to be locked. Please try again.');
            }
        }

        const pages = await getPages(contentFrame);
        logger.info(`Found ${pages.length} pages. Starting extraction...`);

        // Track used filenames in this section to handle collisions
        const usedNames = new Set();

        for (const pageInfo of pages) {
            // Deduplicate pages too
            if (processedItems.has(pageInfo.id)) continue;
            processedItems.add(pageInfo.id);

            logger.info(`Exporting: ${pageInfo.name} ...`);

            try {
                await selectPage(contentFrame, pageInfo.id);
                await contentFrame.waitForTimeout(3000);

                if (options.dodump) {
                    const pageDumpPath = path.resolve(__dirname, `../debug_page_${sanitize(pageInfo.name)}.html`);
                    await fs.writeFile(pageDumpPath, await contentFrame.content());
                }

                const content = await getPageContent(contentFrame);

                // Determine unique filename
                let baseName = sanitize(pageInfo.name || 'Untitled');
                let sanitizedNoteName = baseName;
                let collisionCount = 1;
                while (usedNames.has(sanitizedNoteName)) {
                    sanitizedNoteName = `${baseName}_${collisionCount++}`;
                }
                usedNames.add(sanitizedNoteName);
                const totalAssets = (content.images?.length || 0) +
                    (content.attachments?.length || 0) +
                    (content.videos?.length || 0);

                let updatedHtml = content.contentHtml || '';
                let assetCounter = 1;

                // Rename and Download Resources
                let savedResources = 0;
                const assetDir = path.join(sectionDir, 'assets');

                if (totalAssets > 0) {
                    await fs.ensureDir(assetDir);

                    // Helper to get unique filename in assets dir
                    const getUniqueAssetPath = (base, ext) => {
                        let name = sanitize(base);
                        let fullPath = path.join(assetDir, `${name}.${ext}`);
                        let counter = 1;
                        while (fs.existsSync(fullPath)) {
                            fullPath = path.join(assetDir, `${name}_${counter++}.${ext}`);
                        }
                        return fullPath;
                    };

                    // 1. Process Images (including Printouts)
                    for (const imgInfo of content.images || []) {
                        // For printouts, we might eventually want better names, but for now:
                        const finalBaseName = `${sanitizedNoteName}_img_${assetCounter++}`;
                        const imgPath = path.join(assetDir, `${finalBaseName}.png`);

                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-src="${imgInfo.id}"`, 'g'), `data-local-src="${finalBaseName}"`);

                        const success = await downloadResource(contentFrame.page(), imgInfo.src, imgPath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved IMAGE to: ${path.relative(process.cwd(), imgPath)}`);
                        }
                    }

                    // 2. Process Attachments
                    for (const attachInfo of content.attachments || []) {
                        let originalName = attachInfo.originalName || 'file';
                        let baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
                        let ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';

                        const filePath = getUniqueAssetPath(baseName, ext);
                        const finalFileName = path.basename(filePath);

                        // Tag it so Turndown knows the final filename
                        // We replace the ID with the actual FULL filename for the 'data-local-file' attribute
                        // This ensures parser.js can trust it directly if it contains a dot.
                        // We also capture and replace any existing data-filename attribute.
                        const escapedId = attachInfo.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        updatedHtml = updatedHtml.replace(
                            new RegExp(`data-local-file="${escapedId}"( data-filename="[^"]*")?`, 'g'),
                            `data-local-file="${finalFileName}" data-filename="${finalFileName}"`
                        );

                        const success = await downloadAttachment(contentFrame, attachInfo, filePath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved ATTACHMENT to: ${path.relative(process.cwd(), filePath)}`);
                        }
                    }

                    // 3. Process Videos
                    for (const videoInfo of content.videos || []) {
                        // Better extension detection for videos
                        let ext = 'mp4';
                        if (videoInfo.src) {
                            try {
                                const urlObj = new URL(videoInfo.src);
                                const pathname = urlObj.pathname;
                                const potentialExt = pathname.split('.').pop();
                                if (potentialExt && potentialExt.length < 5 && /^[a-z0-9]+$/i.test(potentialExt)) {
                                    ext = potentialExt;
                                }
                            } catch (e) {
                                // Fallback
                            }
                        }

                        const finalBaseName = `${sanitizedNoteName}_video_${assetCounter++}`;
                        const filePath = path.join(assetDir, `${finalBaseName}.${ext}`);

                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-video="${videoInfo.id}"`, 'g'), `data-local-video="${finalBaseName}"`);

                        const success = await downloadResource(contentFrame.page(), videoInfo.src, filePath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved VIDEO to: ${path.relative(process.cwd(), filePath)}`);
                        }
                    }
                }

                const markdown = td.turndown(updatedHtml);
                const fileName = sanitizedNoteName + '.md';
                const filePath = path.join(sectionDir, fileName);

                // Store page in map for cross-linking (relative to output base)
                pageIdMap[pageInfo.id] = {
                    path: filePath,
                    internalLinks: content.internalLinks,
                    isDir: false
                };

                const finalContent = `${content.dateTime}\n\n${markdown}`;

                await fs.writeFile(filePath, finalContent);
                stats.totalPages++;
                stats.totalAssets += savedResources;
                logger.success(`Saved (${savedResources} assets)`);

            } catch (e) {
                logger.error(`Failed to export ${pageInfo.name}:`, e);
            }
        }
    }
}

async function runExport(options = {}) {
    let session;

    try {
        // ── Fast path: --notebook-link skips the listing entirely ────────────
        if (options.notebookLink) {
            logger.info('Notebook link provided — skipping notebook listing.');
            session = await openNotebookByLink(options);

            const notebookName = session.notebookName || 'Notebook';
            logger.info(`Exporting notebook: ${notebookName}`);

            logger.info('Looking for OneNote content frame...');
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        logger.success(`Found content frame (navigation): ${f.url()}`);
                        if (options.dodump) {
                            logger.warn('Dumping content frame HTML to debug_notebook_content.html...');
                            const frameContent = await f.content();
                            await fs.writeFile(path.resolve(__dirname, '../debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {}
            }

            if (!contentFrame) {
                logger.warn('Could not auto-detect content frame. Using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, require('sanitize-filename')(notebookName));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            logger.info('Scanning sections...');
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                logger.warn('Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSections(contentFrame, outputBase, td, options, pageIdMap, new Set(), null, stats);

            logger.info('Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            logger.success('Export complete!');
            logger.info(`Total Pages: ${stats.totalPages}`);
            logger.info(`Total Assets: ${stats.totalAssets}`);
            logger.info(`Files saved in: ${outputBase}`);
            return;
        }
        // ────────────────────────────────────────────────────────────────────

        logger.info('Fetching notebooks...');
        session = await listNotebooks({ ...options, keepOpen: true });

        const { notebooks } = session;

        if (notebooks.length === 0) {
            logger.warn('No notebook have been found.');
            logger.warn('Remember: you can export a notebook by using the export command with the --notebook-link <url> option.');
            return;
        }

        let selectedNotebook;

        if (options.notebook) {
            logger.info(`Auto-selecting notebook: "${options.notebook}"...`);
            selectedNotebook = notebooks.find(nb => nb.name === options.notebook);

            if (!selectedNotebook) {
                throw new Error(`Notebook "${options.notebook}" not found in list. Available: ${notebooks.map(n => n.name).join(', ')}`);
            }
        } else {
            const prompt = new Select({
                name: 'notebook',
                message: 'Select a notebook to export:',
                choices: notebooks.map(nb => nb.name)
            });

            const answer = await prompt.run();
            selectedNotebook = notebooks.find(nb => nb.name === answer);
        }

        if (selectedNotebook) {
            logger.info(`You selected: ${selectedNotebook.name}`);
            await openNotebook(session.page, session.scrapeTarget, selectedNotebook.id);
            logger.success('Successfully entered notebook.');

            logger.info('Looking for OneNote content frame...');
            // Wait for frames to have time to load dynamic content
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;

            // Heuristic: Find frame with .sectionList or similar
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        logger.success(`Found content frame (navigation): ${f.url()}`);

                        if (options.dodump) {
                            logger.warn('Dumping content frame HTML to debug_notebook_content.html...');
                            const frameContent = await f.content();
                            await fs.writeFile(path.resolve(__dirname, '../debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {
                    // Ignore frames we can't access (CORS) or don't have the element
                }
            }

            if (!contentFrame) {
                logger.warn('Could not auto-detect content frame. using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, sanitize(selectedNotebook.name));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            logger.info('Scanning sections...');
            // Wait for section list specifically
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                logger.warn('Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            // Start recursive processing
            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSections(contentFrame, outputBase, td, options, pageIdMap, new Set(), null, stats);

            logger.info('Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            logger.success('Export complete!');
            logger.info(`Total Pages: ${stats.totalPages}`);
            logger.info(`Total Assets: ${stats.totalAssets}`);
            logger.info(`Files saved in: ${outputBase}`);
        }

    } catch (e) {
        logger.error('Export failed:', e);
    } finally {
        if (session && session.browser) {
            logger.debug('Closing browser...');
            await session.browser.close();
        }
    }
}

/**
 * Electron-aware export adapter.
 * Mirrors runExport() but sends all output via sendEvent(type, payload) callback.
 *
 * @param {object} options     - { notebook, notheadless, nopassasked }
 * @param {function} sendEvent - (type, payload) => void
 * @param {object} ipcMain     - electron ipcMain for section-lock round-trips
 */
async function runExportForElectron(options = {}, sendEvent, ipcMain) {
    const log = (level, message) => sendEvent('log', { level, message });
    // Download timeout in ms — user-configurable, default 60 s
    const downloadTimeout = options.downloadTimeout || 60000;
    // Shared onError callback that routes download failures to the GUI log
    const onDownloadError = (msg) => log('warn', `⚠ Asset skipped — ${msg}`);

    // ── Inline section processing adapted for Electron ──────────────────────
    async function processSectionsElectron(contentFrame, outputDir, td, pageIdMap, processedItems = new Set(), parentId = null, stats) {
        const sections = await getSections(contentFrame, parentId);
        if (sections.length === 0 && parentId) {
            log('debug', '(No items found in this group)');
        } else {
            log('info', `Found ${sections.length} items at current level.`);
        }

        for (const item of sections) {
            if (processedItems.has(item.id)) continue;

            if (item.type === 'group') {
                const groupName = sanitize(item.name);
                const groupDir = path.join(outputDir, groupName);
                await fs.ensureDir(groupDir);
                pageIdMap[item.id] = { path: groupDir, isDir: true };
                processedItems.add(item.id);
                try {
                    log('info', `Entering group: ${item.name}`);
                    await selectSection(contentFrame, item.id);
                    await contentFrame.waitForTimeout(5000);
                    await processSectionsElectron(contentFrame, groupDir, td, pageIdMap, processedItems, item.id, stats);
                    log('info', `Returning from group: ${item.name}`);
                    await navigateBack(contentFrame);
                    await contentFrame.waitForTimeout(3000);
                } catch (e) {
                    log('error', `Failed to process group ${item.name}: ${e.message}`);
                }
                continue;
            }

            // Regular Section
            try {
                await selectSection(contentFrame, item.id);
            } catch (e) {
                log('error', `Failed to select section ${item.name}: ${e.message}`);
                continue;
            }

            await contentFrame.waitForTimeout(3000);
            let isLocked = await isSectionLocked(contentFrame);
            if (isLocked) {
                await contentFrame.waitForTimeout(2000);
                isLocked = await isSectionLocked(contentFrame);
            }

            const baseSectionName = sanitize(item.name);
            const isHeadless = !options.notheadless;

            if (isLocked && (options.nopassasked || isHeadless)) {
                log('warn', `Section "${item.name}" is password protected — skipping.`);
                const protectedDir = path.join(outputDir, baseSectionName + ' [passProtected]');
                await fs.ensureDir(protectedDir);
                processedItems.add(item.id);
                continue;
            }

            const sectionDir = path.join(outputDir, baseSectionName);
            await fs.ensureDir(sectionDir);
            pageIdMap[item.id] = { path: sectionDir, isDir: true };
            log('step', `[Section] ${item.name}`);
            processedItems.add(item.id);

            // Section locked → ask user to unlock via GUI dialog
            while (isLocked) {
                log('warn', `Section "${item.name}" is password protected.`);
                sendEvent('section-locked', { sectionName: item.name });
                await new Promise((resolve) => {
                    ipcMain.once('section-unlocked', () => resolve());
                });
                await contentFrame.waitForTimeout(2000);
                isLocked = await isSectionLocked(contentFrame);
                if (isLocked) {
                    log('error', 'Section still appears to be locked. Please try again.');
                }
            }

            const pages = await getPages(contentFrame);
            log('info', `Found ${pages.length} pages. Starting extraction...`);
            const usedNames = new Set();

            for (const pageInfo of pages) {
                if (processedItems.has(pageInfo.id)) continue;
                processedItems.add(pageInfo.id);

                log('info', `Exporting: ${pageInfo.name} ...`);
                sendEvent('progress', { pageName: pageInfo.name, totalPages: stats.totalPages, totalAssets: stats.totalAssets });

                try {
                    await selectPage(contentFrame, pageInfo.id);
                    await contentFrame.waitForTimeout(3000);

                    const content = await getPageContent(contentFrame);
                    let baseName = sanitize(pageInfo.name || 'Untitled');
                    let sanitizedNoteName = baseName;
                    let collisionCount = 1;
                    while (usedNames.has(sanitizedNoteName)) {
                        sanitizedNoteName = `${baseName}_${collisionCount++}`;
                    }
                    usedNames.add(sanitizedNoteName);

                    const totalAssets = (content.images?.length || 0) + (content.attachments?.length || 0) + (content.videos?.length || 0);
                    let updatedHtml = content.contentHtml || '';
                    let assetCounter = 1;
                    let savedResources = 0;
                    const assetDir = path.join(sectionDir, 'assets');

                    if (totalAssets > 0) {
                        await fs.ensureDir(assetDir);
                        const getUniqueAssetPath = (base, ext) => {
                            let name = sanitize(base);
                            let fullPath = path.join(assetDir, `${name}.${ext}`);
                            let counter = 1;
                            while (fs.existsSync(fullPath)) {
                                fullPath = path.join(assetDir, `${name}_${counter++}.${ext}`);
                            }
                            return fullPath;
                        };

                        for (const imgInfo of content.images || []) {
                            const finalBaseName = `${sanitizedNoteName}_img_${assetCounter++}`;
                            const imgPath = path.join(assetDir, `${finalBaseName}.png`);
                            updatedHtml = updatedHtml.replace(new RegExp(`data-local-src="${imgInfo.id}"`, 'g'), `data-local-src="${finalBaseName}"`);
                            const success = await downloadResource(contentFrame.page(), imgInfo.src, imgPath, { timeout: downloadTimeout, onError: onDownloadError });
                            if (success) savedResources++;
                        }

                        for (const attachInfo of content.attachments || []) {
                            let originalName = attachInfo.originalName || 'file';
                            let bName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
                            let ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
                            const filePath = getUniqueAssetPath(bName, ext);
                            const finalFileName = path.basename(filePath);
                            const escapedId = attachInfo.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            updatedHtml = updatedHtml.replace(
                                new RegExp(`data-local-file="${escapedId}"( data-filename="[^"]*")?`, 'g'),
                                `data-local-file="${finalFileName}" data-filename="${finalFileName}"`
                            );
                            const success = await downloadAttachment(contentFrame, attachInfo, filePath);
                            if (success) savedResources++;
                        }

                        for (const videoInfo of content.videos || []) {
                            let ext = 'mp4';
                            if (videoInfo.src) {
                                try {
                                    const urlObj = new URL(videoInfo.src);
                                    const potentialExt = urlObj.pathname.split('.').pop();
                                    if (potentialExt && potentialExt.length < 5 && /^[a-z0-9]+$/i.test(potentialExt)) ext = potentialExt;
                                } catch (e) {}
                            }
                            const finalBaseName = `${sanitizedNoteName}_video_${assetCounter++}`;
                            const filePath = path.join(assetDir, `${finalBaseName}.${ext}`);
                            updatedHtml = updatedHtml.replace(new RegExp(`data-local-video="${videoInfo.id}"`, 'g'), `data-local-video="${finalBaseName}"`);
                            const success = await downloadResource(contentFrame.page(), videoInfo.src, filePath, { timeout: downloadTimeout, onError: onDownloadError });
                            if (success) savedResources++;
                        }
                    }

                    const markdown = td.turndown(updatedHtml);
                    const fileName = sanitizedNoteName + '.md';
                    const filePath = path.join(sectionDir, fileName);
                    pageIdMap[pageInfo.id] = { path: filePath, internalLinks: content.internalLinks, isDir: false };
                    const finalContent = `${content.dateTime}\n\n${markdown}`;
                    await fs.writeFile(filePath, finalContent);
                    stats.totalPages++;
                    stats.totalAssets += savedResources;
                    log('success', `Saved "${pageInfo.name}" (${savedResources} assets)`);
                    sendEvent('progress', { pageName: pageInfo.name, totalPages: stats.totalPages, totalAssets: stats.totalAssets });
                } catch (e) {
                    log('error', `Failed to export ${pageInfo.name}: ${e.message}`);
                }
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────

    let session;
    try {
        if (options.notebookLink) {
            log('info', 'Notebook link provided — skipping notebook listing.');
            session = await openNotebookByLink(options);
            const notebookName = session.notebookName || 'Notebook';
            log('info', `Exporting notebook: ${notebookName}`);

            log('info', 'Looking for OneNote content frame...');
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        log('success', `Found content frame: ${f.url()}`);
                        break;
                    }
                } catch (e) {}
            }
            if (!contentFrame) {
                log('warn', 'Could not auto-detect content frame. Using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, sanitize(notebookName));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            log('info', 'Scanning sections...');
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                log('warn', 'Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSectionsElectron(contentFrame, outputBase, td, pageIdMap, new Set(), null, stats);

            log('info', 'Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            log('success', 'Export complete!');
            sendEvent('export-complete', { totalPages: stats.totalPages, totalAssets: stats.totalAssets, outputDir: outputBase });
            return { success: true, ...stats, outputDir: outputBase };
        }

        log('info', 'Fetching notebooks...');
        session = await listNotebooks({ ...options, keepOpen: true });
        const { notebooks } = session;

        if (notebooks.length === 0) {
            log('warn', 'No notebook have been found.');
            log('warn', 'Remember: you can export a notebook by using the export command with the --notebook-link <url> option.');
            return { success: false, error: 'No notebooks found.' };
        }

        let selectedNotebook;
        if (options.notebook) {
            log('info', `Auto-selecting notebook: "${options.notebook}"...`);
            selectedNotebook = notebooks.find(nb => nb.name === options.notebook);
            if (!selectedNotebook) {
                throw new Error(`Notebook "${options.notebook}" not found. Available: ${notebooks.map(n => n.name).join(', ')}`);
            }
        } else {
            throw new Error('No notebook specified. Pass options.notebook.');
        }

        log('info', `Exporting: ${selectedNotebook.name}`);
        await openNotebook(session.page, session.scrapeTarget, selectedNotebook.id);
        log('success', 'Successfully entered notebook.');

        log('info', 'Looking for OneNote content frame...');
        await session.page.waitForTimeout(10000);

        const frames = session.page.frames();
        let contentFrame = null;
        for (const f of frames) {
            try {
                const hasSections = await f.$('.sectionList');
                if (hasSections) {
                    contentFrame = f;
                    log('success', `Found content frame: ${f.url()}`);
                    break;
                }
            } catch (e) {}
        }
        if (!contentFrame) {
            log('warn', 'Could not auto-detect content frame. Using main page as fallback...');
            contentFrame = session.page;
        }

        const baseDir = options.exportDir || path.resolve(__dirname, '../output');
        const outputBase = path.resolve(baseDir, sanitize(selectedNotebook.name));
        await fs.ensureDir(outputBase);
        const td = createMarkdownConverter();

        log('info', 'Scanning sections...');
        try {
            await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
        } catch (e) {
            log('warn', 'Timeout waiting for .sectionList, trying to scrape anyway...');
        }

        const pageIdMap = {};
        const stats = { totalPages: 0, totalAssets: 0 };
        await processSectionsElectron(contentFrame, outputBase, td, pageIdMap, new Set(), null, stats);

        log('info', 'Resolving internal links...');
        await resolveInternalLinks(pageIdMap, outputBase);

        log('success', 'Export complete!');
        sendEvent('export-complete', { totalPages: stats.totalPages, totalAssets: stats.totalAssets, outputDir: outputBase });
        return { success: true, ...stats, outputDir: outputBase };
    } catch (e) {
        log('error', `Export failed: ${e.message}`);
        sendEvent('export-error', { error: e.message });
        return { success: false, error: e.message };
    } finally {
        if (session && session.browser) {
            await session.browser.close();
        }
    }
}

module.exports = { runExport, runExportForElectron };
===
const { Select } = require('enquirer');
const logger = require('./utils/logger');
const { listNotebooks, openNotebook, openNotebookByLink } = require('./navigator');
const { getSections, getPages, selectSection, selectPage, getPageContent, navigateBack, isSectionLocked } = require('./scrapers');
const { createMarkdownConverter } = require('./parser');
const { resolveInternalLinks } = require('./linkResolver');
const { withRetry } = require('./utils/retry');
const readline = require('readline');
const fs = require('fs-extra');
const path = require('path');
const sanitize = require('sanitize-filename');

const { downloadAttachment } = require('./downloadStrategies');

// Rename and generalize to downloadResource with retry logic
// options.timeout  - HTTP request timeout in ms (default 60 000)
// options.onError  - optional (msg) => void callback called on final failure
async function downloadResource(page, url, outputPath, options = {}) {
    const { timeout = 60000, onError } = options;
    return withRetry(async () => {
        if (url.startsWith('data:')) {
            const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                await fs.writeFile(outputPath, buffer);
                return true;
            }
            return false;
        }

        const response = await page.context().request.get(url, { timeout });
        if (response.ok()) {
            await fs.writeFile(outputPath, await response.body());
            return true;
        } else {
            throw new Error(`Failed to download resource (HTTP ${response.status()}): ${url.substring(0, 100)}...`);
        }
    }, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        operationName: `Download resource`,
        silent: true
    }).catch((e) => {
        const shortUrl = url.substring(0, 80) + '…';
        const msg = `Download failed (${e.message.split('\n')[0]}): ${shortUrl}`;
        logger.error(msg);
        if (onError) onError(msg);
        return false;
    });
}

function waitForEnter(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(message, () => {
            rl.close();
            resolve();
        });
    });
}

async function processSections(contentFrame, outputDir, td, options, pageIdMap, processedItems = new Set(), parentId = null, stats = { totalPages: 0, totalAssets: 0 }) {
    const sections = await getSections(contentFrame, parentId);
    if (sections.length === 0 && parentId) {
        logger.debug('(No items found in this group)');
    } else {
        logger.info(`Found ${sections.length} items at current level.`);
    }

    for (const item of sections) {
        if (processedItems.has(item.id)) continue;

        if (item.type === 'group') {
            const groupName = sanitize(item.name);
            const groupDir = path.join(outputDir, groupName);
            await fs.ensureDir(groupDir);

            // Map the Group ID to its directory for internal links
            pageIdMap[item.id] = { path: groupDir, isDir: true };
            processedItems.add(item.id);

            try {
                logger.info(`Entering group: ${item.name}`);
                await selectSection(contentFrame, item.id);
                // Extra wait for the tree to expand
                await contentFrame.waitForTimeout(5000);

                if (options.dodump) {
                    const dumpPath = path.resolve(__dirname, `../debug_group_${sanitize(item.name)}.html`);
                    await fs.writeFile(dumpPath, await contentFrame.content());
                }
                await processSections(contentFrame, groupDir, td, options, pageIdMap, processedItems, item.id, stats);
                logger.info(`Returning from group: ${item.name}`);
                await navigateBack(contentFrame);
                await contentFrame.waitForTimeout(3000);
            } catch (e) {
                logger.error(`Failed to process group ${item.name}:`, e);
            }
            continue;
        }

        // Processing regular Section
        try {
            await selectSection(contentFrame, item.id);
        } catch (e) {
            logger.error(`Failed to select section ${item.name}:`, e);
            continue;
        }

        await contentFrame.waitForTimeout(3000);

        // Check for password protection
        let isLocked = await isSectionLocked(contentFrame);

        // If locked, wait another 2s and re-check to avoid transition glitches from previous sections
        if (isLocked) {
            await contentFrame.waitForTimeout(2000);
            isLocked = await isSectionLocked(contentFrame);
        }

        const baseSectionName = sanitize(item.name);

        const isHeadless = !options.notheadless;
        if (isLocked && (options.nopassasked || isHeadless)) {
            if (isHeadless && !options.nopassasked) {
                logger.warn(`Section "${item.name}" is password protected.`);
                logger.warn(`The browser is running in headless mode, which means you cannot interact with it to unlock the section manually.`);
                logger.warn(`Acting as if --nopassasked was set: skipping this section.`);
            } else {
                logger.warn(`Section "${item.name}" appears password protected. Skipping as requested.`);
            }
            const protectedDir = path.join(outputDir, baseSectionName + " [passProtected]");
            await fs.ensureDir(protectedDir);
            processedItems.add(item.id);
            continue;
        }

        const sectionDir = path.join(outputDir, baseSectionName);
        await fs.ensureDir(sectionDir);

        // Map the Section ID to its directory for internal links
        pageIdMap[item.id] = { path: sectionDir, isDir: true };

        logger.step(`[Section] ${item.name}`);
        processedItems.add(item.id);

        while (isLocked) {
            logger.warn(`Section "${item.name}" is password protected.`);
            logger.info('Please switch to the browser window, unlock the section manually, and then return here.');
            await waitForEnter('Press ENTER here once the section is unlocked to continue...');

            // Re-verify
            await contentFrame.waitForTimeout(2000);
            isLocked = await isSectionLocked(contentFrame);
            if (isLocked) {
                logger.error('Section still appears to be locked. Please try again.');
            }
        }

        const pages = await getPages(contentFrame);
        logger.info(`Found ${pages.length} pages. Starting extraction...`);

        // Track used filenames in this section to handle collisions
        const usedNames = new Set();

        for (const pageInfo of pages) {
            // Deduplicate pages too
            if (processedItems.has(pageInfo.id)) continue;
            processedItems.add(pageInfo.id);

            logger.info(`Exporting: ${pageInfo.name} ...`);

            try {
                await selectPage(contentFrame, pageInfo.id);
                await contentFrame.waitForTimeout(3000);

                if (options.dodump) {
                    const pageDumpPath = path.resolve(__dirname, `../debug_page_${sanitize(pageInfo.name)}.html`);
                    await fs.writeFile(pageDumpPath, await contentFrame.content());
                }

                const content = await getPageContent(contentFrame);

                // Determine unique filename
                let baseName = sanitize(pageInfo.name || 'Untitled');
                let sanitizedNoteName = baseName;
                let collisionCount = 1;
                while (usedNames.has(sanitizedNoteName)) {
                    sanitizedNoteName = `${baseName}_${collisionCount++}`;
                }
                usedNames.add(sanitizedNoteName);
                const totalAssets = (content.images?.length || 0) +
                    (content.attachments?.length || 0) +
                    (content.videos?.length || 0);

                let updatedHtml = content.contentHtml || '';
                let assetCounter = 1;

                // Rename and Download Resources
                let savedResources = 0;
                const assetDir = path.join(sectionDir, 'assets');

                if (totalAssets > 0) {
                    await fs.ensureDir(assetDir);

                    // Helper to get unique filename in assets dir
                    const getUniqueAssetPath = (base, ext) => {
                        let name = sanitize(base);
                        let fullPath = path.join(assetDir, `${name}.${ext}`);
                        let counter = 1;
                        while (fs.existsSync(fullPath)) {
                            fullPath = path.join(assetDir, `${name}_${counter++}.${ext}`);
                        }
                        return fullPath;
                    };

                    // 1. Process Images (including Printouts)
                    for (const imgInfo of content.images || []) {
                        // For printouts, we might eventually want better names, but for now:
                        const finalBaseName = `${sanitizedNoteName}_img_${assetCounter++}`;
                        const imgPath = path.join(assetDir, `${finalBaseName}.png`);

                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-src="${imgInfo.id}"`, 'g'), `data-local-src="${finalBaseName}"`);

                        const success = await downloadResource(contentFrame.page(), imgInfo.src, imgPath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved IMAGE to: ${path.relative(process.cwd(), imgPath)}`);
                        }
                    }

                    // 2. Process Attachments
                    for (const attachInfo of content.attachments || []) {
                        let originalName = attachInfo.originalName || 'file';
                        let baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
                        let ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';

                        const filePath = getUniqueAssetPath(baseName, ext);
                        const finalFileName = path.basename(filePath);

                        // Tag it so Turndown knows the final filename
                        // We replace the ID with the actual FULL filename for the 'data-local-file' attribute
                        // This ensures parser.js can trust it directly if it contains a dot.
                        // We also capture and replace any existing data-filename attribute.
                        const escapedId = attachInfo.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        updatedHtml = updatedHtml.replace(
                            new RegExp(`data-local-file="${escapedId}"( data-filename="[^"]*")?`, 'g'),
                            `data-local-file="${finalFileName}" data-filename="${finalFileName}"`
                        );

                        const success = await downloadAttachment(contentFrame, attachInfo, filePath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved ATTACHMENT to: ${path.relative(process.cwd(), filePath)}`);
                        }
                    }

                    // 3. Process Videos
                    for (const videoInfo of content.videos || []) {
                        // Better extension detection for videos
                        let ext = 'mp4';
                        if (videoInfo.src) {
                            try {
                                const urlObj = new URL(videoInfo.src);
                                const pathname = urlObj.pathname;
                                const potentialExt = pathname.split('.').pop();
                                if (potentialExt && potentialExt.length < 5 && /^[a-z0-9]+$/i.test(potentialExt)) {
                                    ext = potentialExt;
                                }
                            } catch (e) {
                                // Fallback
                            }
                        }

                        const finalBaseName = `${sanitizedNoteName}_video_${assetCounter++}`;
                        const filePath = path.join(assetDir, `${finalBaseName}.${ext}`);

                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-video="${videoInfo.id}"`, 'g'), `data-local-video="${finalBaseName}"`);

                        const success = await downloadResource(contentFrame.page(), videoInfo.src, filePath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved VIDEO to: ${path.relative(process.cwd(), filePath)}`);
                        }
                    }
                }

                const markdown = td.turndown(updatedHtml);
                const fileName = sanitizedNoteName + '.md';
                const filePath = path.join(sectionDir, fileName);

                // Store page in map for cross-linking (relative to output base)
                pageIdMap[pageInfo.id] = {
                    path: filePath,
                    internalLinks: content.internalLinks,
                    isDir: false
                };

                const finalContent = `${content.dateTime}\n\n${markdown}`;

                await fs.writeFile(filePath, finalContent);
                stats.totalPages++;
                stats.totalAssets += savedResources;
                logger.success(`Saved (${savedResources} assets)`);

            } catch (e) {
                logger.error(`Failed to export ${pageInfo.name}:`, e);
            }
        }
    }
}

async function runExport(options = {}) {
    let session;

    try {
        // ── Fast path: --notebook-link skips the listing entirely ────────────
        if (options.notebookLink) {
            logger.info('Notebook link provided — skipping notebook listing.');
            session = await openNotebookByLink(options);

            const notebookName = session.notebookName || 'Notebook';
            logger.info(`Exporting notebook: ${notebookName}`);

            logger.info('Looking for OneNote content frame...');
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        logger.success(`Found content frame (navigation): ${f.url()}`);
                        if (options.dodump) {
                            logger.warn('Dumping content frame HTML to debug_notebook_content.html...');
                            const frameContent = await f.content();
                            await fs.writeFile(path.resolve(__dirname, '../debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {}
            }

            if (!contentFrame) {
                logger.warn('Could not auto-detect content frame. Using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, require('sanitize-filename')(notebookName));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            logger.info('Scanning sections...');
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                logger.warn('Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSections(contentFrame, outputBase, td, options, pageIdMap, new Set(), null, stats);

            logger.info('Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            logger.success('Export complete!');
            logger.info(`Total Pages: ${stats.totalPages}`);
            logger.info(`Total Assets: ${stats.totalAssets}`);
            logger.info(`Files saved in: ${outputBase}`);
            return;
        }
        // ────────────────────────────────────────────────────────────────────

        logger.info('Fetching notebooks...');
        session = await listNotebooks({ ...options, keepOpen: true });

        const { notebooks } = session;

        if (notebooks.length === 0) {
            logger.warn('No notebook have been found.');
            logger.warn('Remember: you can export a notebook by using the export command with the --notebook-link <url> option.');
            return;
        }

        let selectedNotebook;

        if (options.notebook) {
            logger.info(`Auto-selecting notebook: "${options.notebook}"...`);
            selectedNotebook = notebooks.find(nb => nb.name === options.notebook);

            if (!selectedNotebook) {
                throw new Error(`Notebook "${options.notebook}" not found in list. Available: ${notebooks.map(n => n.name).join(', ')}`);
            }
        } else {
            const prompt = new Select({
                name: 'notebook',
                message: 'Select a notebook to export:',
                choices: notebooks.map(nb => nb.name)
            });

            const answer = await prompt.run();
            selectedNotebook = notebooks.find(nb => nb.name === answer);
        }

        if (selectedNotebook) {
            logger.info(`You selected: ${selectedNotebook.name}`);
            await openNotebook(session.page, session.scrapeTarget, selectedNotebook.id);
            logger.success('Successfully entered notebook.');

            logger.info('Looking for OneNote content frame...');
            // Wait for frames to have time to load dynamic content
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;

            // Heuristic: Find frame with .sectionList or similar
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        logger.success(`Found content frame (navigation): ${f.url()}`);

                        if (options.dodump) {
                            logger.warn('Dumping content frame HTML to debug_notebook_content.html...');
                            const frameContent = await f.content();
                            await fs.writeFile(path.resolve(__dirname, '../debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {
                    // Ignore frames we can't access (CORS) or don't have the element
                }
            }

            if (!contentFrame) {
                logger.warn('Could not auto-detect content frame. using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, sanitize(selectedNotebook.name));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            logger.info('Scanning sections...');
            // Wait for section list specifically
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                logger.warn('Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            // Start recursive processing
            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSections(contentFrame, outputBase, td, options, pageIdMap, new Set(), null, stats);

            logger.info('Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            logger.success('Export complete!');
            logger.info(`Total Pages: ${stats.totalPages}`);
            logger.info(`Total Assets: ${stats.totalAssets}`);
            logger.info(`Files saved in: ${outputBase}`);
        }

    } catch (e) {
        logger.error('Export failed:', e);
    } finally {
        if (session && session.browser) {
            logger.debug('Closing browser...');
            await session.browser.close();
        }
    }
}

/**
 * Electron-aware export adapter.
 * Mirrors runExport() but sends all output via sendEvent(type, payload) callback.
 *
 * @param {object} options     - { notebook, notheadless, nopassasked }
 * @param {function} sendEvent - (type, payload) => void
 * @param {object} ipcMain     - electron ipcMain for section-lock round-trips
 */
async function runExportForElectron(options = {}, sendEvent, ipcMain) {
    const log = (level, message) => sendEvent('log', { level, message });
    // Download timeout in ms — user-configurable, default 60 s
    const downloadTimeout = options.downloadTimeout || 60000;
    // Shared onError callback that routes download failures to the GUI log
    const onDownloadError = (msg) => log('warn', `⚠ Asset skipped — ${msg}`);

    // ── Inline section processing adapted for Electron ──────────────────────
    async function processSectionsElectron(contentFrame, outputDir, td, pageIdMap, processedItems = new Set(), parentId = null, stats) {
        const sections = await getSections(contentFrame, parentId);
        if (sections.length === 0 && parentId) {
            log('debug', '(No items found in this group)');
        } else {
            log('info', `Found ${sections.length} items at current level.`);
        }

        for (const item of sections) {
            if (processedItems.has(item.id)) continue;

            if (item.type === 'group') {
                const groupName = sanitize(item.name);
                const groupDir = path.join(outputDir, groupName);
                await fs.ensureDir(groupDir);
                pageIdMap[item.id] = { path: groupDir, isDir: true };
                processedItems.add(item.id);
                try {
                    log('info', `Entering group: ${item.name}`);
                    await selectSection(contentFrame, item.id);
                    await contentFrame.waitForTimeout(5000);
                    if (options.dodump) {
                        const dumpPath = path.resolve(__dirname, `../debug_group_${sanitize(item.name)}.html`);
                        await fs.writeFile(dumpPath, await contentFrame.content());
                    }
                    await processSectionsElectron(contentFrame, groupDir, td, pageIdMap, processedItems, item.id, stats);
                    log('info', `Returning from group: ${item.name}`);
                    await navigateBack(contentFrame);
                    await contentFrame.waitForTimeout(3000);
                } catch (e) {
                    log('error', `Failed to process group ${item.name}: ${e.message}`);
                }
                continue;
            }

            // Regular Section
            try {
                await selectSection(contentFrame, item.id);
            } catch (e) {
                log('error', `Failed to select section ${item.name}: ${e.message}`);
                continue;
            }

            await contentFrame.waitForTimeout(3000);
            let isLocked = await isSectionLocked(contentFrame);
            if (isLocked) {
                await contentFrame.waitForTimeout(2000);
                isLocked = await isSectionLocked(contentFrame);
            }

            const baseSectionName = sanitize(item.name);
            const isHeadless = !options.notheadless;

            if (isLocked && (options.nopassasked || isHeadless)) {
                log('warn', `Section "${item.name}" is password protected — skipping.`);
                const protectedDir = path.join(outputDir, baseSectionName + ' [passProtected]');
                await fs.ensureDir(protectedDir);
                processedItems.add(item.id);
                continue;
            }

            const sectionDir = path.join(outputDir, baseSectionName);
            await fs.ensureDir(sectionDir);
            pageIdMap[item.id] = { path: sectionDir, isDir: true };
            log('step', `[Section] ${item.name}`);
            processedItems.add(item.id);

            // Section locked → ask user to unlock via GUI dialog
            while (isLocked) {
                log('warn', `Section "${item.name}" is password protected.`);
                sendEvent('section-locked', { sectionName: item.name });
                await new Promise((resolve) => {
                    ipcMain.once('section-unlocked', () => resolve());
                });
                await contentFrame.waitForTimeout(2000);
                isLocked = await isSectionLocked(contentFrame);
                if (isLocked) {
                    log('error', 'Section still appears to be locked. Please try again.');
                }
            }

            const pages = await getPages(contentFrame);
            log('info', `Found ${pages.length} pages. Starting extraction...`);
            const usedNames = new Set();

            for (const pageInfo of pages) {
                if (processedItems.has(pageInfo.id)) continue;
                processedItems.add(pageInfo.id);

                log('info', `Exporting: ${pageInfo.name} ...`);
                sendEvent('progress', { pageName: pageInfo.name, totalPages: stats.totalPages, totalAssets: stats.totalAssets });

                try {
                    await selectPage(contentFrame, pageInfo.id);
                    await contentFrame.waitForTimeout(3000);

                    if (options.dodump) {
                        const pageDumpPath = path.resolve(__dirname, `../debug_page_${sanitize(pageInfo.name)}.html`);
                        await fs.writeFile(pageDumpPath, await contentFrame.content());
                    }

                    const content = await getPageContent(contentFrame);
                    let baseName = sanitize(pageInfo.name || 'Untitled');
                    let sanitizedNoteName = baseName;
                    let collisionCount = 1;
                    while (usedNames.has(sanitizedNoteName)) {
                        sanitizedNoteName = `${baseName}_${collisionCount++}`;
                    }
                    usedNames.add(sanitizedNoteName);

                    const totalAssets = (content.images?.length || 0) + (content.attachments?.length || 0) + (content.videos?.length || 0);
                    let updatedHtml = content.contentHtml || '';
                    let assetCounter = 1;
                    let savedResources = 0;
                    const assetDir = path.join(sectionDir, 'assets');

                    if (totalAssets > 0) {
                        await fs.ensureDir(assetDir);
                        const getUniqueAssetPath = (base, ext) => {
                            let name = sanitize(base);
                            let fullPath = path.join(assetDir, `${name}.${ext}`);
                            let counter = 1;
                            while (fs.existsSync(fullPath)) {
                                fullPath = path.join(assetDir, `${name}_${counter++}.${ext}`);
                            }
                            return fullPath;
                        };

                        for (const imgInfo of content.images || []) {
                            const finalBaseName = `${sanitizedNoteName}_img_${assetCounter++}`;
                            const imgPath = path.join(assetDir, `${finalBaseName}.png`);
                            updatedHtml = updatedHtml.replace(new RegExp(`data-local-src="${imgInfo.id}"`, 'g'), `data-local-src="${finalBaseName}"`);
                            const success = await downloadResource(contentFrame.page(), imgInfo.src, imgPath, { timeout: downloadTimeout, onError: onDownloadError });
                            if (success) savedResources++;
                        }

                        for (const attachInfo of content.attachments || []) {
                            let originalName = attachInfo.originalName || 'file';
                            let bName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
                            let ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
                            const filePath = getUniqueAssetPath(bName, ext);
                            const finalFileName = path.basename(filePath);
                            const escapedId = attachInfo.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            updatedHtml = updatedHtml.replace(
                                new RegExp(`data-local-file="${escapedId}"( data-filename="[^"]*")?`, 'g'),
                                `data-local-file="${finalFileName}" data-filename="${finalFileName}"`
                            );
                            const success = await downloadAttachment(contentFrame, attachInfo, filePath);
                            if (success) savedResources++;
                        }

                        for (const videoInfo of content.videos || []) {
                            let ext = 'mp4';
                            if (videoInfo.src) {
                                try {
                                    const urlObj = new URL(videoInfo.src);
                                    const potentialExt = urlObj.pathname.split('.').pop();
                                    if (potentialExt && potentialExt.length < 5 && /^[a-z0-9]+$/i.test(potentialExt)) ext = potentialExt;
                                } catch (e) {}
                            }
                            const finalBaseName = `${sanitizedNoteName}_video_${assetCounter++}`;
                            const filePath = path.join(assetDir, `${finalBaseName}.${ext}`);
                            updatedHtml = updatedHtml.replace(new RegExp(`data-local-video="${videoInfo.id}"`, 'g'), `data-local-video="${finalBaseName}"`);
                            const success = await downloadResource(contentFrame.page(), videoInfo.src, filePath, { timeout: downloadTimeout, onError: onDownloadError });
                            if (success) savedResources++;
                        }
                    }

                    const markdown = td.turndown(updatedHtml);
                    const fileName = sanitizedNoteName + '.md';
                    const filePath = path.join(sectionDir, fileName);
                    pageIdMap[pageInfo.id] = { path: filePath, internalLinks: content.internalLinks, isDir: false };
                    const finalContent = `${content.dateTime}\n\n${markdown}`;
                    await fs.writeFile(filePath, finalContent);
                    stats.totalPages++;
                    stats.totalAssets += savedResources;
                    log('success', `Saved "${pageInfo.name}" (${savedResources} assets)`);
                    sendEvent('progress', { pageName: pageInfo.name, totalPages: stats.totalPages, totalAssets: stats.totalAssets });
                } catch (e) {
                    log('error', `Failed to export ${pageInfo.name}: ${e.message}`);
                }
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────

    let session;
    try {
        if (options.notebookLink) {
            log('info', 'Notebook link provided — skipping notebook listing.');
            session = await openNotebookByLink(options);
            const notebookName = session.notebookName || 'Notebook';
            log('info', `Exporting notebook: ${notebookName}`);

            log('info', 'Looking for OneNote content frame...');
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        log('success', `Found content frame: ${f.url()}`);

                        if (options.dodump) {
                            log('warn', 'Dumping content frame HTML to debug_notebook_content.html...');
                            const frameContent = await f.content();
                            await fs.writeFile(path.resolve(__dirname, '../debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {}
            }
            if (!contentFrame) {
                log('warn', 'Could not auto-detect content frame. Using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, sanitize(notebookName));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            log('info', 'Scanning sections...');
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                log('warn', 'Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSectionsElectron(contentFrame, outputBase, td, pageIdMap, new Set(), null, stats);

            log('info', 'Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            log('success', 'Export complete!');
            sendEvent('export-complete', { totalPages: stats.totalPages, totalAssets: stats.totalAssets, outputDir: outputBase });
            return { success: true, ...stats, outputDir: outputBase };
        }

        log('info', 'Fetching notebooks...');
        session = await listNotebooks({ ...options, keepOpen: true });
        const { notebooks } = session;

        if (notebooks.length === 0) {
            log('warn', 'No notebook have been found.');
            log('warn', 'Remember: you can export a notebook by using the export command with the --notebook-link <url> option.');
            return { success: false, error: 'No notebooks found.' };
        }

        let selectedNotebook;
        if (options.notebook) {
            log('info', `Auto-selecting notebook: "${options.notebook}"...`);
            selectedNotebook = notebooks.find(nb => nb.name === options.notebook);
            if (!selectedNotebook) {
                throw new Error(`Notebook "${options.notebook}" not found. Available: ${notebooks.map(n => n.name).join(', ')}`);
            }
        } else {
            throw new Error('No notebook specified. Pass options.notebook.');
        }

        log('info', `Exporting: ${selectedNotebook.name}`);
        await openNotebook(session.page, session.scrapeTarget, selectedNotebook.id);
        log('success', 'Successfully entered notebook.');

        log('info', 'Looking for OneNote content frame...');
        await session.page.waitForTimeout(10000);

        const frames = session.page.frames();
        let contentFrame = null;
        for (const f of frames) {
            try {
                const hasSections = await f.$('.sectionList');
                if (hasSections) {
                    contentFrame = f;
                    log('success', `Found content frame: ${f.url()}`);

                    if (options.dodump) {
                        log('warn', 'Dumping content frame HTML to debug_notebook_content.html...');
                        const frameContent = await f.content();
                        await fs.writeFile(path.resolve(__dirname, '../debug_notebook_content.html'), frameContent);
                    }
                    break;
                }
            } catch (e) {}
        }
        if (!contentFrame) {
            log('warn', 'Could not auto-detect content frame. Using main page as fallback...');
            contentFrame = session.page;
        }

        const baseDir = options.exportDir || path.resolve(__dirname, '../output');
        const outputBase = path.resolve(baseDir, sanitize(selectedNotebook.name));
        await fs.ensureDir(outputBase);
        const td = createMarkdownConverter();

        log('info', 'Scanning sections...');
        try {
            await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
        } catch (e) {
            log('warn', 'Timeout waiting for .sectionList, trying to scrape anyway...');
        }

        const pageIdMap = {};
        const stats = { totalPages: 0, totalAssets: 0 };
        await processSectionsElectron(contentFrame, outputBase, td, pageIdMap, new Set(), null, stats);

        log('info', 'Resolving internal links...');
        await resolveInternalLinks(pageIdMap, outputBase);

        log('success', 'Export complete!');
        sendEvent('export-complete', { totalPages: stats.totalPages, totalAssets: stats.totalAssets, outputDir: outputBase });
        return { success: true, ...stats, outputDir: outputBase };
    } catch (e) {
        log('error', `Export failed: ${e.message}`);
        sendEvent('export-error', { error: e.message });
        return { success: false, error: e.message };
    } finally {
        if (session && session.browser) {
            await session.browser.close();
        }
    }
}

module.exports = { runExport, runExportForElectron };
```
```diff:auth.js
const { chromium } = require('playwright');
const fs = require('fs-extra');
const logger = require('./utils/logger');
const { AUTH_FILE, ONENOTE_URL } = require('./config');
const readline = require('readline');

// Companion metadata file — stores email + login time for the GUI display
const AUTH_META_FILE = AUTH_FILE.replace('auth.json', 'auth-meta.json');

/** Returns { email, loginTime } from auth-meta.json, or null if not found. */
async function getAuthMeta() {
    try {
        if (await fs.pathExists(AUTH_META_FILE)) {
            return await fs.readJson(AUTH_META_FILE);
        }
    } catch (e) { }
    return null;
}

/** Deletes auth.json and auth-meta.json (full logout). */
async function logout() {
    await fs.remove(AUTH_FILE);
    await fs.remove(AUTH_META_FILE);
}

/**
 * Prompts the user for input in the terminal.
 */
function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function login(credentials = {}) {
    const { login: email, password } = credentials;
    const isAutomated = !!(email && password);
    const headless = !credentials.notheadless && isAutomated;

    // Added to verify version on user's machine
    logger.debug('Authentication Module: Version 4.4-DEBUG starting...');

    if (isAutomated) {
        logger.info(`Attempting automated login for ${email}...`);
    } else {
        logger.info('Launching browser for manual authentication...');
        logger.warn('Please log in to your Microsoft account in the browser window.');
        logger.warn('The script will wait until you successfully reach the notebook list.');
    }

    const browser = await chromium.launch({ headless: !!headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(ONENOTE_URL);

        if (isAutomated) {
            logger.step('Automating login steps...');

            // 0. Handle landing page if it appears (redirection to onenote.cloud.microsoft)
            try {
                // Look for "Sign in" button. 
                // Using a more robust selector that targets the button by its accessible name.
                const signInButton = page.getByRole('button', { name: 'Sign in' }).first();

                // Properly wait for visibility
                await signInButton.waitFor({ state: 'visible', timeout: 10000 });

                logger.info('Landing page detected. Clicking "Sign in"...');

                // Clicking and waiting for a change - could be navigation or just URL change.
                // We use noWaitAfter: true because Microsoft pages often have multiple redirects
                // and we'll wait for the login form in the next step anyway.
                await signInButton.click({ noWaitAfter: true });

                // Wait for the login page to start loading or the email field to appear
                // Instead of waitForNavigation which is flaky with redirects, we just wait for the next step's selector
                logger.debug('Clicked "Sign in", waiting for login form...');
            } catch (e) {
                logger.debug('Landing page not detected or "Sign in" button not found within timeout.');
            }

            // 1. Enter Email
            try {
                // Wait for either lofinfmt OR a potential login.microsoftonline.com / login.live.com URL
                await page.waitForSelector('input[name="loginfmt"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="loginfmt"]', email);

                logger.info('Email entered. Clicking "Next"...');
                await page.click('input[type="submit"]');

                // CRITICAL: Wait for the email field to disappear or the page to change
                logger.debug('Waiting for email field to disappear...');
                await page.waitForSelector('input[name="loginfmt"]', { state: 'hidden', timeout: 15000 }).catch(() => {
                    logger.debug('Email field still present, proceeding with caution.');
                });

                // Give the UI a moment to settle into the next screen (MFA/Password)
                await page.waitForTimeout(1000);

                // Check if an error appeared immediately after clicking Next (e.g. invalid email)
                const usernameError = page.locator('#usernameError');
                if (await usernameError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await usernameError.textContent();
                    throw new Error(`Login Error (Username): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                logger.error(`Failed to enter email: ${e.message}`);
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_email.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.error(`Email submission failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after email step (before MFA detection)
            if (credentials.dodump) {
                const debugFile = 'debug_after_email.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                logger.debug(`[dodump] Post-email state dumped to ${debugFile}`);
            }

            // 1.5. Handle intermediate screens (MFA selection, "Other ways to sign in")
            try {
                // Re-poll the page state after the stabilization delay
                const pageTitle = (await page.title()).trim();
                const pageHeading = (await page.locator('h1, [role="heading"]').first().textContent().catch(() => '')).trim();

                logger.debug(`Settled State: Title="${pageTitle}" | Heading="${pageHeading}"`);
                logger.debug('Checking for intermediate MFA/Sign-in option screens...');

                // We'll race between several possible states.
                // We strongly prioritize MFA headings and "Other ways" links.

                const result = await Promise.race([
                    page.waitForSelector('text=/Other ways to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Get a code to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Verify your identity/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                    page.waitForSelector('text=/Approve a request on my Microsoft Authenticator app/i', { state: 'visible', timeout: 5000 }).then(() => 'approve_app'),
                    // Only match password if it's REALLY there and we've waited a bit
                    page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 15000 }).then(() => 'password'),
                    // Fallback for some weird MFA screens where heading is the only clue
                    page.waitForFunction(() => {
                        const h = document.querySelector('h1, [role="heading"]')?.textContent || '';
                        return h.includes('Get a code') || h.includes('Verify your identity');
                    }, { timeout: 15000 }).then(() => 'other_ways'),
                ]).catch((err) => {
                    logger.debug(`Detection race timed out or failed: ${err.message}`);
                    return 'timeout';
                });

                logger.debug(`Intermediate screen detection result: ${result}`);

                // Proactive dump when intermediate screen is reached
                if (credentials.dodump) {
                    const debugFile = 'debug_intermediate_screen.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.debug(`[dodump] Intermediate screen state dumped to ${debugFile}`);
                }

                if (result === 'other_ways' || pageHeading.includes('Get a code') || pageHeading.includes('Verify your identity')) {
                    logger.info('Detected MFA/Verification screen. Attempting to locate "Other ways to sign in"...');

                    // Use built-in Playwright locators which are more robust
                    const otherWays = page.getByRole('button', { name: /Other ways to sign in|Sign in another way/i })
                        .or(page.getByText(/Other ways to sign in|Sign in another way/i))
                        .first();

                    try {
                        // Wait up to 15s for it to be attached
                        logger.debug('Waiting for "Other ways" link to appear in DOM...');
                        await otherWays.waitFor({ state: 'attached', timeout: 15000 });

                        // Log its visibility status for debugging
                        const isVisible = await otherWays.isVisible();
                        logger.debug(`"Other ways" link visibility: ${isVisible}`);

                        logger.info('Clicking "Other ways to sign in"...');
                        // Multiple click attempts: standard, then forced, then JS
                        try {
                            await otherWays.click({ timeout: 5000 });
                        } catch (e) {
                            logger.debug(`Standard click failed, trying forced: ${e.message}`);
                            await otherWays.click({ force: true, timeout: 5000 });
                        }
                    } catch (e) {
                        logger.warn(`MFA link interaction failed: ${e.message}`);

                        // Final fallback: try to find and click via JS evaluate
                        logger.debug('Attempting final fallback: JavaScript-based click...');
                        const clicked = await page.evaluate(() => {
                            const elements = Array.from(document.querySelectorAll('span, a, button'));
                            const target = elements.find(el =>
                                el.textContent.toLowerCase().includes('other ways to sign in') ||
                                el.textContent.toLowerCase().includes('sign in another way')
                            );
                            if (target) {
                                target.click();
                                return true;
                            }
                            return false;
                        });

                        if (clicked) {
                            logger.info('Successfully triggered click via JavaScript fallback.');
                        } else if (pageHeading.includes('Get a code')) {
                            throw new Error('STUCK: "Other ways to sign in" link not found even via JS scan.');
                        }
                    }

                    // Wait for the next screen (selection of verification method)
                    logger.debug('Waiting for method selection screen ("Use your password")...');
                    // Use a longer timeout for the switch, sometimes it's slow
                    const subResult = await Promise.race([
                        page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('#idA_PWD_SwitchToPassword', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('text=/Select a verification method/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways_list'),
                    ]).catch(() => 'timeout');

                    logger.debug(`Sub-screen detection result: ${subResult}`);

                    if (subResult === 'use_password') {
                        logger.info('Selecting "Use your password" option...');
                        await page.click('text=/Use your password/i');
                    } else if (subResult === 'other_ways_list') {
                        logger.info('Selection list detected. Looking for "Password"...');
                        await page.click('text=/Password|Use your password/i');
                    }
                } else if (result === 'use_password') {
                    logger.info('Detected "Use your password" option. Clicking...');
                    await page.click('text="Use your password"');
                } else if (result === 'approve_app') {
                    logger.warn('MFA notification already sent. Attempting to switch to password...');
                    const otherLink = page.locator('text="Other ways to sign in", #signInAnotherWay').first();
                    if (await otherLink.isVisible()) {
                        await otherLink.click();
                        await page.waitForSelector('text="Use your password"', { state: 'visible', timeout: 10000 });
                        await page.click('text="Use your password"');
                    }
                } else if (result === 'password') {
                    logger.debug('Direct password field detected.');
                } else if (result === 'timeout') {
                    logger.debug('No intermediate screen detected within timeout. Proceeding to password entry.');
                }
            } catch (e) {
                logger.debug(`Intermediate screen handler encountered a fatal issue: ${e.message}`);
            }

            // 2. Enter Password
            try {
                // Wait for password field to appear
                // Wait for password field and be sure it's the right one
                await page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="passwd"]', password);

                // Click the submit button on the password page. 
                // We use a more specific selector and wait for it to be enabled.
                const submitButton = page.locator('input[type="submit"], button[type="submit"]').filter({ hasText: /Sign in|Next|Finish/i }).first();

                logger.debug('Waiting for submit button to be enabled...');
                await submitButton.waitFor({ state: 'visible', timeout: 10000 });
                // If it's still disabled, we might be on the wrong screen or input is missing
                if (await submitButton.isDisabled()) {
                    logger.debug('Submit button is disabled. It might be the wrong one or the password field is not considered filled.');
                    // Try to click anyway as a fallback, or wait a bit longer
                    await page.waitForTimeout(1000);
                }

                await submitButton.click();

                // Check for password error (e.g. incorrect password)
                const passwordError = page.locator('#passwordError');
                if (await passwordError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await passwordError.textContent();
                    throw new Error(`Login Error (Password): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_password.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.error(`Password entry failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after password submission (before post-password MFA check)
            if (credentials.dodump) {
                const debugFile = 'debug_after_password.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                logger.debug(`[dodump] Post-password state dumped to ${debugFile}`);
            }

            // 2.5. Handle post-password MFA/Verification if needed
            try {
                // Check if we are stuck on a verification screen
                // Includes new Number Matching MFA ("Approve sign in request" with a displayed number)
                const verificationScreen = await Promise.race([
                    page.waitForSelector('text="Verify your identity"', { timeout: 10000 }).then(() => 'verify'),
                    page.waitForSelector('text="Enter code"', { timeout: 10000 }).then(() => 'enter_code'),
                    page.waitForSelector('input[name="otc"]', { timeout: 10000 }).then(() => 'otc_input'),
                    // Number Matching MFA: corporate accounts show a number the user must enter in Authenticator
                    page.waitForSelector('text=/Approve sign in request/i', { timeout: 10000 }).then(() => 'number_match'),
                    page.waitForSelector('.displaySign', { timeout: 10000 }).then(() => 'number_match'),
                ]).catch(() => null);

                if (credentials.dodump) {
                    const debugFile = 'debug_post_password_mfa.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.debug(`[dodump] Post-password MFA screen state dumped to ${debugFile}`);
                }

                if (verificationScreen === 'number_match') {
                    // ── Number Matching MFA (corporate accounts) ──────────────────────────
                    // Microsoft shows a 2-digit number; user must enter it in Authenticator
                    // app on their phone and tap OK — the page then auto-advances.
                    // No browser interaction is required after extracting the number.
                    logger.warn('Number Matching MFA detected ("Approve sign in request" screen).');

                    let matchNumber = '??';
                    try {
                        matchNumber = await page.$eval('.displaySign', el => el.textContent.trim());
                    } catch (_) {
                        logger.debug('Could not extract number from .displaySign — user may still see it if --notheadless is used.');
                    }

                    logger.step('══════════════════════════════════════════════════════');
                    logger.step(`  ACTION REQUIRED: Open Microsoft Authenticator on your phone.`);
                    logger.step(`  Enter the number:  ${matchNumber}`);
                    logger.step(`  Then tap "Yes" / "Approve" in the app.`);
                    logger.step('══════════════════════════════════════════════════════');
                    logger.info('Waiting for phone approval (up to 120 seconds)...');

                    // Wait for the page to auto-advance after phone approval.
                    // The MFA page disappears and Microsoft redirects to the next step.
                    await Promise.race([
                        page.waitForSelector('.displaySign', { state: 'hidden', timeout: 120000 }),
                        page.waitForURL(url => !url.toString().includes('login.microsoftonline.com'), { timeout: 120000 }),
                        page.waitForSelector('text=/Stay signed in/i', { timeout: 120000 }),
                    ]);

                    logger.success('Phone approval received. Continuing login flow...');

                } else if (verificationScreen) {
                    // ── OTC / TOTP code (email / authenticator code) ──────────────────────
                    logger.warn('MFA/Verification screen detected.');
                    logger.step('A verification code is required. Please check your email or authenticator app.');

                    const code = await promptUser('Enter the verification code: ');

                    if (await page.locator('input[name="otc"]').isVisible()) {
                        await page.fill('input[name="otc"]', code);
                    } else if (await page.locator('input[type="tel"]').isVisible()) {
                        await page.fill('input[type="tel"]', code);
                    } else {
                        // Fallback: try to find any visible text input
                        await page.locator('input[type="text"]:visible, input[type="tel"]:visible').first().fill(code);
                    }

                    await page.click('input[type="submit"]');
                }
            } catch (e) {
                logger.debug(`Post-password verification handling skipped or failed: ${e.message}`);
            }
            // 2.7. Handle "Help protect your account" interrupt screen
            try {
                // This screen may appear after password entry
                const interruptPrompt = page.getByText(/Help protect your account/i).first();
                if (await interruptPrompt.isVisible({ timeout: 5000 }) || page.url().includes('account.live.com/interrupt/')) {
                    logger.info('Detected "Help protect your account" interrupt screen.');
                    const skipButton = page.getByRole('button', { name: /Skip for now/i })
                        .or(page.getByText(/Skip for now/i))
                        .first();
                    if (await skipButton.isVisible()) {
                        logger.info('Clicking "Skip for now"...');
                        await skipButton.click();
                    }
                }
            } catch (e) {
                logger.debug(`Help protect your account interrupt screen did not appear: ${e.message}`);
            }

            // 3. Handle "Stay signed in?" prompt if it appears
            try {
                // This step might not always appear depending on the account state
                logger.debug('Checking for "Stay signed in?" prompt...');

                // Use built-in locators for detection
                const staySignedIn = page.getByText(/Stay signed in?/i)
                    .or(page.locator('#KmsiDescription'))
                    .first();

                // Wait for the prompt with a reasonable timeout
                await staySignedIn.waitFor({ state: 'visible', timeout: 7000 });

                logger.info('Detected "Stay signed in?" prompt.');

                // Optionally check "Don't show this again" if it exists
                const dontShowAgain = page.locator('input[name="DontShowAgain"], #KmsiCheckboxField').first();
                if (await dontShowAgain.isVisible()) {
                    logger.debug('Checking "Don\'t show this again" checkbox...');
                    await dontShowAgain.check().catch(() => { });
                }

                // The provided HTML shows a button with text "Yes" and data-testid="primaryButton"
                const yesButton = page.getByRole('button', { name: /^Yes$/i })
                    .or(page.locator('button[data-testid="primaryButton"]'))
                    .or(page.locator('#idSIButton9'))
                    .first();

                logger.info('Clicking "Yes" to stay signed in...');
                await yesButton.click();
            } catch (e) {
                logger.debug(`Stay signed in prompt did not appear or was not recognized: ${e.message}`);
                // If we hit a timeout, it might just be the redirect already happened
            }

            // 4. Wait for redirection to notebooks list
            try {
                logger.info('Waiting for redirection to notebooks list...');

                // Wait for either the URL pattern or a success indicator in the DOM
                await Promise.any([
                    page.waitForURL(url => url.toString().includes('/notebooks') || url.hostname.includes('onenote.cloud.microsoft') || url.hostname.includes('onenote.com'), { timeout: 60000 }),
                    page.waitForSelector('text="My notebooks"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Create new notebook"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Welcome, "', { state: 'visible', timeout: 60000 })
                ]);

                logger.success('Notebooks list detected.');
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_notebooks.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.error(`Success detection failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }
        } else {
            logger.warn('Login flow requires manual interaction.');
            logger.step('>>> Once you see your Notebooks list in the browser, return here and press ENTER to continue. <<<');

            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            await new Promise(resolve => {
                rl.question('', () => {
                    rl.close();
                    resolve();
                });
            });
        }

        logger.info('Saving authentication state...');
        await context.storageState({ path: AUTH_FILE });
        
        // Persist email + time so that check command can show the logged-in user
        await fs.writeJson(AUTH_META_FILE, {
            email: email || 'manual login',
            loginTime: new Date().toISOString()
        });
        
        logger.success(`Authentication successful! State saved to ${AUTH_FILE}`);
    } catch (error) {
        logger.error('Authentication failed or cancelled:', error);
        if (isAutomated) {
            logger.debug('Possible cause: incorrect credentials, MFA requirement, or selector change.');
        }
    } finally {
        await browser.close();
    }
}

async function getAuthenticatedContext(browser) {
    if (await fs.pathExists(AUTH_FILE)) {
        return browser.newContext({ storageState: AUTH_FILE });
    } else {
        throw new Error('No authentication state found. Please run "login" command first.');
    }
}

async function checkAuth() {
    if (!(await fs.pathExists(AUTH_FILE))) {
        return false;
    }

    let browser;
    try {
        logger.debug('Verifying authentication session...');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ storageState: AUTH_FILE });
        const page = await context.newPage();

        // Go to OneNote URL
        await page.goto(ONENOTE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Wait briefly to allow client-side redirects to Microsoft login pages if session is dead
        await page.waitForTimeout(2000);

        const url = page.url();
        const isLoginUrl = url.includes('login.live.com') || url.includes('login.microsoftonline.com');

        if (isLoginUrl) {
            logger.warn('Authentication session has expired. Deleting stale auth state.');
            await logout();
            return false;
        }

        // Check for common error pages or other signs of invalid auth if necessary
        return true;
    } catch (e) {
        logger.debug(`Session verification encountered an error (timeout/network): ${e.message}`);
        // If we couldn't load the page properly due to network or timeout, 
        // we default to true to prevent accidentally logging out the user.
        return true;
    } finally {
        logger.debug(`Looks like user is logged in.`);
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Electron-aware login adapter.
 * Identical logic to login() but emits progress via sendEvent(type, payload)
 * instead of using readline stdin or the logger module.
 *
 * @param {object} credentials  - { login, password, notheadless, dodump }
 * @param {function} sendEvent  - (type, payload) => void — forwards events to the renderer
 * @param {object} ipcMain      - the electron ipcMain, used for OTC round-trip dialogs
 */
async function loginForElectron(credentials = {}, sendEvent, ipcMain) {
    const { login: email, password } = credentials;
    const isAutomated = !!(email && password);
    const headless = !credentials.notheadless && isAutomated;

    const log = (level, message) => sendEvent('log', { level, message });

    log('debug', 'Authentication Module: Version 4.4-DEBUG starting (Electron mode)...');

    if (isAutomated) {
        log('info', `Attempting automated login for ${email}...`);
    } else {
        log('info', 'Launching browser for manual authentication...');
        log('warn', 'Please log in to your Microsoft account in the browser window.');
        log('warn', 'The script will wait until you successfully reach the notebook list.');
    }

    const browser = await chromium.launch({ headless: !!headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(ONENOTE_URL);

        if (isAutomated) {
            log('step', 'Automating login steps...');

            // 0. Handle landing page
            try {
                const signInButton = page.getByRole('button', { name: 'Sign in' }).first();
                await signInButton.waitFor({ state: 'visible', timeout: 10000 });
                log('info', 'Landing page detected. Clicking "Sign in"...');
                await signInButton.click({ noWaitAfter: true });
                log('debug', 'Clicked "Sign in", waiting for login form...');
            } catch (e) {
                log('debug', 'Landing page not detected or "Sign in" button not found within timeout.');
            }

            // 1. Enter Email
            try {
                await page.waitForSelector('input[name="loginfmt"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="loginfmt"]', email);
                log('info', 'Email entered. Clicking "Next"...');
                await page.click('input[type="submit"]');
                log('debug', 'Waiting for email field to disappear...');
                await page.waitForSelector('input[name="loginfmt"]', { state: 'hidden', timeout: 15000 }).catch(() => {
                    log('debug', 'Email field still present, proceeding with caution.');
                });
                await page.waitForTimeout(1000);
                const usernameError = page.locator('#usernameError');
                if (await usernameError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await usernameError.textContent();
                    throw new Error(`Login Error (Username): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                log('error', `Failed to enter email: ${e.message}`);
                throw e;
            }

            // Proactive dump after email step (before MFA detection)
            if (credentials.dodump) {
                const debugFile = 'debug_after_email.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                log('debug', `[dodump] Post-email state dumped to ${debugFile}`);
            }

            // 1.5. Handle intermediate screens (MFA selection)
            try {
                const pageTitle = (await page.title()).trim();
                const pageHeading = (await page.locator('h1, [role="heading"]').first().textContent().catch(() => '')).trim();
                log('debug', `Settled State: Title="${pageTitle}" | Heading="${pageHeading}"`);
                log('debug', 'Checking for intermediate MFA/Sign-in option screens...');

                const result = await Promise.race([
                    page.waitForSelector('text=/Other ways to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Get a code to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Verify your identity/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                    page.waitForSelector('text=/Approve a request on my Microsoft Authenticator app/i', { state: 'visible', timeout: 5000 }).then(() => 'approve_app'),
                    page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 15000 }).then(() => 'password'),
                    page.waitForFunction(() => {
                        const h = document.querySelector('h1, [role="heading"]')?.textContent || '';
                        return h.includes('Get a code') || h.includes('Verify your identity');
                    }, { timeout: 15000 }).then(() => 'other_ways'),
                ]).catch((err) => {
                    log('debug', `Detection race timed out or failed: ${err.message}`);
                    return 'timeout';
                });

                log('debug', `Intermediate screen detection result: ${result}`);

                // Proactive dump when intermediate screen is reached
                if (credentials.dodump) {
                    const debugFile = 'debug_intermediate_screen.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    log('debug', `[dodump] Intermediate screen state dumped to ${debugFile}`);
                }

                if (result === 'other_ways' || pageHeading.includes('Get a code') || pageHeading.includes('Verify your identity')) {
                    log('info', 'Detected MFA/Verification screen. Attempting to locate "Other ways to sign in"...');
                    const otherWays = page.getByRole('button', { name: /Other ways to sign in|Sign in another way/i })
                        .or(page.getByText(/Other ways to sign in|Sign in another way/i)).first();
                    try {
                        await otherWays.waitFor({ state: 'attached', timeout: 15000 });
                        const isVisible = await otherWays.isVisible();
                        log('debug', `"Other ways" link visibility: ${isVisible}`);
                        log('info', 'Clicking "Other ways to sign in"...');
                        try {
                            await otherWays.click({ timeout: 5000 });
                        } catch (e) {
                            await otherWays.click({ force: true, timeout: 5000 });
                        }
                    } catch (e) {
                        log('warn', `MFA link interaction failed: ${e.message}`);
                        const clicked = await page.evaluate(() => {
                            const elements = Array.from(document.querySelectorAll('span, a, button'));
                            const target = elements.find(el =>
                                el.textContent.toLowerCase().includes('other ways to sign in') ||
                                el.textContent.toLowerCase().includes('sign in another way')
                            );
                            if (target) { target.click(); return true; }
                            return false;
                        });
                        if (!clicked && pageHeading.includes('Get a code')) {
                            throw new Error('STUCK: "Other ways to sign in" link not found even via JS scan.');
                        }
                    }
                    const subResult = await Promise.race([
                        page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('#idA_PWD_SwitchToPassword', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('text=/Select a verification method/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways_list'),
                    ]).catch(() => 'timeout');

                    if (subResult === 'use_password') {
                        log('info', 'Selecting "Use your password" option...');
                        await page.click('text=/Use your password/i');
                    } else if (subResult === 'other_ways_list') {
                        await page.click('text=/Password|Use your password/i');
                    }
                } else if (result === 'use_password') {
                    await page.click('text="Use your password"');
                } else if (result === 'approve_app') {
                    const otherLink = page.locator('text="Other ways to sign in", #signInAnotherWay').first();
                    if (await otherLink.isVisible()) {
                        await otherLink.click();
                        await page.waitForSelector('text="Use your password"', { state: 'visible', timeout: 10000 });
                        await page.click('text="Use your password"');
                    }
                }
            } catch (e) {
                log('debug', `Intermediate screen handler encountered a fatal issue: ${e.message}`);
            }

            // 2. Enter Password
            try {
                await page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="passwd"]', password);
                const submitButton = page.locator('input[type="submit"], button[type="submit"]').filter({ hasText: /Sign in|Next|Finish/i }).first();
                await submitButton.waitFor({ state: 'visible', timeout: 10000 });
                if (await submitButton.isDisabled()) { await page.waitForTimeout(1000); }
                await submitButton.click();
                const passwordError = page.locator('#passwordError');
                if (await passwordError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await passwordError.textContent();
                    throw new Error(`Login Error (Password): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                throw e;
            }

            // Proactive dump after password submission (before post-password MFA check)
            if (credentials.dodump) {
                const debugFile = 'debug_after_password.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                log('debug', `[dodump] Post-password state dumped to ${debugFile}`);
            }

            // 2.5. Handle post-password MFA/Verification (OTC prompt via GUI dialog)
            //      Also handles Number Matching MFA (corporate accounts)
            try {
                const verificationScreen = await Promise.race([
                    page.waitForSelector('text="Verify your identity"', { timeout: 10000 }).then(() => 'verify'),
                    page.waitForSelector('text="Enter code"', { timeout: 10000 }).then(() => 'enter_code'),
                    page.waitForSelector('input[name="otc"]', { timeout: 10000 }).then(() => 'otc_input'),
                    // Number Matching MFA: corporate accounts show a number to enter in Authenticator
                    page.waitForSelector('text=/Approve sign in request/i', { timeout: 10000 }).then(() => 'number_match'),
                    page.waitForSelector('.displaySign', { timeout: 10000 }).then(() => 'number_match'),
                ]).catch(() => null);

                if (credentials.dodump) {
                    const debugFile = 'debug_post_password_mfa.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    log('debug', `[dodump] Post-password MFA screen state dumped to ${debugFile}`);
                }

                if (verificationScreen === 'number_match') {
                    // ── Number Matching MFA (corporate accounts) ──────────────────────────
                    // Microsoft shows a 2-digit number; user must enter it in Authenticator
                    // on their phone and tap OK — the page then auto-advances.
                    log('warn', 'Number Matching MFA detected ("Approve sign in request" screen).');

                    let matchNumber = '??';
                    try {
                        matchNumber = await page.$eval('.displaySign', el => el.textContent.trim());
                    } catch (_) {
                        log('debug', 'Could not extract number from .displaySign.');
                    }

                    // Notify the Electron renderer — it will show a waiting popup to the user
                    sendEvent('mfa-number-match', { number: matchNumber });
                    log('warn', `Number Matching MFA — user must enter ${matchNumber} in Microsoft Authenticator.`);

                    // Wait silently for phone approval to auto-advance the page (no browser action needed)
                    log('info', 'Waiting for phone approval (up to 120 seconds)...');
                    await Promise.race([
                        page.waitForSelector('.displaySign', { state: 'hidden', timeout: 120000 }),
                        page.waitForURL(url => !url.toString().includes('login.microsoftonline.com'), { timeout: 120000 }),
                        page.waitForSelector('text=/Stay signed in/i', { timeout: 120000 }),
                    ]);

                    log('success', 'Phone approval received. Continuing login flow...');
                    sendEvent('mfa-number-match-approved', {});

                } else if (verificationScreen) {
                    // ── OTC / TOTP code prompt ─────────────────────────────────────────────
                    log('warn', 'MFA/Verification screen detected.');
                    log('step', 'A verification code is required. Please check your email or authenticator app.');

                    // Ask the renderer to show the OTC dialog and wait for user input via IPC
                    sendEvent('otc-required', {});
                    const code = await new Promise((resolve) => {
                        ipcMain.once('otc-reply', (event, value) => resolve(value));
                    });

                    if (await page.locator('input[name="otc"]').isVisible()) {
                        await page.fill('input[name="otc"]', code);
                    } else if (await page.locator('input[type="tel"]').isVisible()) {
                        await page.fill('input[type="tel"]', code);
                    } else {
                        await page.locator('input[type="text"]:visible, input[type="tel"]:visible').first().fill(code);
                    }
                    await page.click('input[type="submit"]');
                }
            } catch (e) {
                log('debug', `Post-password verification handling skipped or failed: ${e.message}`);
            }
            // 2.7. Handle "Help protect your account" interrupt screen
            try {
                const interruptPrompt = page.getByText(/Help protect your account/i).first();
                if (await interruptPrompt.isVisible({ timeout: 5000 }) || page.url().includes('account.live.com/interrupt/')) {
                    log('info', 'Detected "Help protect your account" interrupt screen.');
                    const skipButton = page.getByRole('button', { name: /Skip for now/i })
                        .or(page.getByText(/Skip for now/i))
                        .first();
                    if (await skipButton.isVisible()) {
                        log('info', 'Clicking "Skip for now"...');
                        await skipButton.click();
                    }
                }
            } catch (e) {
                log('debug', `Help protect your account interrupt screen did not appear: ${e.message}`);
            }

            // 3. Handle "Stay signed in?" prompt
            try {
                const staySignedIn = page.getByText(/Stay signed in?/i).or(page.locator('#KmsiDescription')).first();
                await staySignedIn.waitFor({ state: 'visible', timeout: 7000 });
                log('info', 'Detected "Stay signed in?" prompt.');
                const dontShowAgain = page.locator('input[name="DontShowAgain"], #KmsiCheckboxField').first();
                if (await dontShowAgain.isVisible()) { await dontShowAgain.check().catch(() => { }); }
                const yesButton = page.getByRole('button', { name: /^Yes$/i })
                    .or(page.locator('button[data-testid="primaryButton"]'))
                    .or(page.locator('#idSIButton9')).first();
                log('info', 'Clicking "Yes" to stay signed in...');
                await yesButton.click();
            } catch (e) {
                log('debug', `Stay signed in prompt did not appear: ${e.message}`);
            }

            // 4. Wait for redirect to notebooks list
            try {
                log('info', 'Waiting for redirection to notebooks list...');
                await Promise.any([
                    page.waitForURL(url => url.toString().includes('/notebooks') || url.hostname.includes('onenote.cloud.microsoft') || url.hostname.includes('onenote.com'), { timeout: 60000 }),
                    page.waitForSelector('text="My notebooks"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Create new notebook"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Welcome, "', { state: 'visible', timeout: 60000 })
                ]);
                log('success', 'Notebooks list detected.');
            } catch (e) {
                throw e;
            }
        } else {
            // Manual login: tell the renderer to show the "waiting" state
            log('warn', 'Manual login flow — please log in in the browser window that just opened.');
            sendEvent('manual-login-ready', {});
            // Wait for the renderer to send 'manual-login-confirmed' (user clicks "I've logged in" button)
            await new Promise((resolve) => {
                ipcMain.once('manual-login-confirmed', () => resolve());
            });
        }

        log('info', 'Saving authentication state...');
        await context.storageState({ path: AUTH_FILE });
        // Persist email + time so the GUI can show "Logged in as X since HH:MM"
        await fs.writeJson(AUTH_META_FILE, {
            email: email || 'manual login',
            loginTime: new Date().toISOString()
        });
        log('success', `Authentication successful! State saved to ${AUTH_FILE}`);
        return { success: true, email: email || 'manual login', loginTime: new Date().toISOString() };
    } catch (error) {
        log('error', `Authentication failed or cancelled: ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}

module.exports = {
    login,
    loginForElectron,
    getAuthenticatedContext,
    checkAuth,
    getAuthMeta,
    logout
};
===
const { chromium } = require('playwright');
const fs = require('fs-extra');
const logger = require('./utils/logger');
const { AUTH_FILE, ONENOTE_URL } = require('./config');
const readline = require('readline');

// Companion metadata file — stores email + login time for the GUI display
const AUTH_META_FILE = AUTH_FILE.replace('auth.json', 'auth-meta.json');

/** Returns { email, loginTime } from auth-meta.json, or null if not found. */
async function getAuthMeta() {
    try {
        if (await fs.pathExists(AUTH_META_FILE)) {
            return await fs.readJson(AUTH_META_FILE);
        }
    } catch (e) { }
    return null;
}

/** Deletes auth.json and auth-meta.json (full logout). */
async function logout() {
    await fs.remove(AUTH_FILE);
    await fs.remove(AUTH_META_FILE);
}

/**
 * Prompts the user for input in the terminal.
 */
function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function login(credentials = {}) {
    const { login: email, password } = credentials;
    const isAutomated = !!(email && password);
    const headless = !credentials.notheadless && isAutomated;

    // Added to verify version on user's machine
    logger.debug('Authentication Module: Version 4.4-DEBUG starting...');

    if (isAutomated) {
        logger.info(`Attempting automated login for ${email}...`);
    } else {
        logger.info('Launching browser for manual authentication...');
        logger.warn('Please log in to your Microsoft account in the browser window.');
        logger.warn('The script will wait until you successfully reach the notebook list.');
    }

    const browser = await chromium.launch({ headless: !!headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(ONENOTE_URL);

        if (isAutomated) {
            logger.step('Automating login steps...');

            // 0. Handle landing page if it appears (redirection to onenote.cloud.microsoft)
            try {
                // Look for "Sign in" button. 
                // Using a more robust selector that targets the button by its accessible name.
                const signInButton = page.getByRole('button', { name: 'Sign in' }).first();

                // Properly wait for visibility
                await signInButton.waitFor({ state: 'visible', timeout: 10000 });

                logger.info('Landing page detected. Clicking "Sign in"...');

                // Clicking and waiting for a change - could be navigation or just URL change.
                // We use noWaitAfter: true because Microsoft pages often have multiple redirects
                // and we'll wait for the login form in the next step anyway.
                await signInButton.click({ noWaitAfter: true });

                // Wait for the login page to start loading or the email field to appear
                // Instead of waitForNavigation which is flaky with redirects, we just wait for the next step's selector
                logger.debug('Clicked "Sign in", waiting for login form...');
            } catch (e) {
                logger.debug('Landing page not detected or "Sign in" button not found within timeout.');
            }

            // 1. Enter Email
            try {
                // Wait for either lofinfmt OR a potential login.microsoftonline.com / login.live.com URL
                await page.waitForSelector('input[name="loginfmt"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="loginfmt"]', email);

                logger.info('Email entered. Clicking "Next"...');
                await page.click('input[type="submit"]');

                // CRITICAL: Wait for the email field to disappear or the page to change
                logger.debug('Waiting for email field to disappear...');
                await page.waitForSelector('input[name="loginfmt"]', { state: 'hidden', timeout: 15000 }).catch(() => {
                    logger.debug('Email field still present, proceeding with caution.');
                });

                // Give the UI a moment to settle into the next screen (MFA/Password)
                await page.waitForTimeout(1000);

                // Check if an error appeared immediately after clicking Next (e.g. invalid email)
                const usernameError = page.locator('#usernameError');
                if (await usernameError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await usernameError.textContent();
                    throw new Error(`Login Error (Username): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                logger.error(`Failed to enter email: ${e.message}`);
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_email.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.error(`Email submission failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after email step (before MFA detection)
            if (credentials.dodump) {
                const debugFile = 'debug_after_email.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                logger.debug(`[dodump] Post-email state dumped to ${debugFile}`);
            }

            // 1.5. Handle intermediate screens (MFA selection, "Other ways to sign in")
            try {
                // Re-poll the page state after the stabilization delay
                const pageTitle = (await page.title()).trim();
                const pageHeading = (await page.locator('h1, [role="heading"]').first().textContent().catch(() => '')).trim();

                logger.debug(`Settled State: Title="${pageTitle}" | Heading="${pageHeading}"`);
                logger.debug('Checking for intermediate MFA/Sign-in option screens...');

                // We'll race between several possible states.
                // We strongly prioritize MFA headings and "Other ways" links.

                const result = await Promise.race([
                    page.waitForSelector('text=/Other ways to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Get a code to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Verify your identity/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                    page.waitForSelector('text=/Approve a request on my Microsoft Authenticator app/i', { state: 'visible', timeout: 5000 }).then(() => 'approve_app'),
                    // Only match password if it's REALLY there and we've waited a bit
                    page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 15000 }).then(() => 'password'),
                    // Fallback for some weird MFA screens where heading is the only clue
                    page.waitForFunction(() => {
                        const h = document.querySelector('h1, [role="heading"]')?.textContent || '';
                        return h.includes('Get a code') || h.includes('Verify your identity');
                    }, { timeout: 15000 }).then(() => 'other_ways'),
                ]).catch((err) => {
                    logger.debug(`Detection race timed out or failed: ${err.message}`);
                    return 'timeout';
                });

                logger.debug(`Intermediate screen detection result: ${result}`);

                // Proactive dump when intermediate screen is reached
                if (credentials.dodump) {
                    const debugFile = 'debug_intermediate_screen.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.debug(`[dodump] Intermediate screen state dumped to ${debugFile}`);
                }

                if (result === 'other_ways' || pageHeading.includes('Get a code') || pageHeading.includes('Verify your identity')) {
                    logger.info('Detected MFA/Verification screen. Attempting to locate "Other ways to sign in"...');

                    // Use built-in Playwright locators which are more robust
                    const otherWays = page.getByRole('button', { name: /Other ways to sign in|Sign in another way/i })
                        .or(page.getByText(/Other ways to sign in|Sign in another way/i))
                        .first();

                    try {
                        // Wait up to 15s for it to be attached
                        logger.debug('Waiting for "Other ways" link to appear in DOM...');
                        await otherWays.waitFor({ state: 'attached', timeout: 15000 });

                        // Log its visibility status for debugging
                        const isVisible = await otherWays.isVisible();
                        logger.debug(`"Other ways" link visibility: ${isVisible}`);

                        logger.info('Clicking "Other ways to sign in"...');
                        // Multiple click attempts: standard, then forced, then JS
                        try {
                            await otherWays.click({ timeout: 5000 });
                        } catch (e) {
                            logger.debug(`Standard click failed, trying forced: ${e.message}`);
                            await otherWays.click({ force: true, timeout: 5000 });
                        }
                    } catch (e) {
                        logger.warn(`MFA link interaction failed: ${e.message}`);

                        // Final fallback: try to find and click via JS evaluate
                        logger.debug('Attempting final fallback: JavaScript-based click...');
                        const clicked = await page.evaluate(() => {
                            const elements = Array.from(document.querySelectorAll('span, a, button'));
                            const target = elements.find(el =>
                                el.textContent.toLowerCase().includes('other ways to sign in') ||
                                el.textContent.toLowerCase().includes('sign in another way')
                            );
                            if (target) {
                                target.click();
                                return true;
                            }
                            return false;
                        });

                        if (clicked) {
                            logger.info('Successfully triggered click via JavaScript fallback.');
                        } else if (pageHeading.includes('Get a code')) {
                            throw new Error('STUCK: "Other ways to sign in" link not found even via JS scan.');
                        }
                    }

                    // Wait for the next screen (selection of verification method)
                    logger.debug('Waiting for method selection screen ("Use your password")...');
                    // Use a longer timeout for the switch, sometimes it's slow
                    const subResult = await Promise.race([
                        page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('#idA_PWD_SwitchToPassword', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('text=/Select a verification method/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways_list'),
                    ]).catch(() => 'timeout');

                    logger.debug(`Sub-screen detection result: ${subResult}`);

                    if (subResult === 'use_password') {
                        logger.info('Selecting "Use your password" option...');
                        await page.click('text=/Use your password/i');
                    } else if (subResult === 'other_ways_list') {
                        logger.info('Selection list detected. Looking for "Password"...');
                        await page.click('text=/Password|Use your password/i');
                    }
                } else if (result === 'use_password') {
                    logger.info('Detected "Use your password" option. Clicking...');
                    await page.click('text="Use your password"');
                } else if (result === 'approve_app') {
                    logger.warn('MFA notification already sent. Attempting to switch to password...');
                    const otherLink = page.locator('text="Other ways to sign in", #signInAnotherWay').first();
                    if (await otherLink.isVisible()) {
                        await otherLink.click();
                        await page.waitForSelector('text="Use your password"', { state: 'visible', timeout: 10000 });
                        await page.click('text="Use your password"');
                    }
                } else if (result === 'password') {
                    logger.debug('Direct password field detected.');
                } else if (result === 'timeout') {
                    logger.debug('No intermediate screen detected within timeout. Proceeding to password entry.');
                }
            } catch (e) {
                logger.debug(`Intermediate screen handler encountered a fatal issue: ${e.message}`);
            }

            // 2. Enter Password
            try {
                // Wait for password field to appear
                // Wait for password field and be sure it's the right one
                await page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="passwd"]', password);

                // Click the submit button on the password page. 
                // We use a more specific selector and wait for it to be enabled.
                const submitButton = page.locator('input[type="submit"], button[type="submit"]').filter({ hasText: /Sign in|Next|Finish/i }).first();

                logger.debug('Waiting for submit button to be enabled...');
                await submitButton.waitFor({ state: 'visible', timeout: 10000 });
                // If it's still disabled, we might be on the wrong screen or input is missing
                if (await submitButton.isDisabled()) {
                    logger.debug('Submit button is disabled. It might be the wrong one or the password field is not considered filled.');
                    // Try to click anyway as a fallback, or wait a bit longer
                    await page.waitForTimeout(1000);
                }

                await submitButton.click();

                // Check for password error (e.g. incorrect password)
                const passwordError = page.locator('#passwordError');
                if (await passwordError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await passwordError.textContent();
                    throw new Error(`Login Error (Password): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_password.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.error(`Password entry failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after password submission (before post-password MFA check)
            if (credentials.dodump) {
                const debugFile = 'debug_after_password.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                logger.debug(`[dodump] Post-password state dumped to ${debugFile}`);
            }

            // 2.5. Handle post-password MFA/Verification if needed
            try {
                // Check if we are stuck on a verification screen
                // Includes new Number Matching MFA ("Approve sign in request" with a displayed number)
                const verificationScreen = await Promise.race([
                    page.waitForSelector('text="Verify your identity"', { timeout: 10000 }).then(() => 'verify'),
                    page.waitForSelector('text="Enter code"', { timeout: 10000 }).then(() => 'enter_code'),
                    page.waitForSelector('input[name="otc"]', { timeout: 10000 }).then(() => 'otc_input'),
                    // Number Matching MFA: corporate accounts show a number the user must enter in Authenticator
                    page.waitForSelector('text=/Approve sign in request/i', { timeout: 10000 }).then(() => 'number_match'),
                    page.waitForSelector('.displaySign', { timeout: 10000 }).then(() => 'number_match'),
                ]).catch(() => null);

                if (credentials.dodump) {
                    const debugFile = 'debug_post_password_mfa.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.debug(`[dodump] Post-password MFA screen state dumped to ${debugFile}`);
                }

                if (verificationScreen === 'number_match') {
                    // ── Number Matching MFA (corporate accounts) ──────────────────────────
                    // Microsoft shows a 2-digit number; user must enter it in Authenticator
                    // app on their phone and tap OK — the page then auto-advances.
                    // No browser interaction is required after extracting the number.
                    logger.warn('Number Matching MFA detected ("Approve sign in request" screen).');

                    let matchNumber = '??';
                    try {
                        matchNumber = await page.$eval('.displaySign', el => el.textContent.trim());
                    } catch (_) {
                        logger.debug('Could not extract number from .displaySign — user may still see it if --notheadless is used.');
                    }

                    logger.step('══════════════════════════════════════════════════════');
                    logger.step(`  ACTION REQUIRED: Open Microsoft Authenticator on your phone.`);
                    logger.step(`  Enter the number:  ${matchNumber}`);
                    logger.step(`  Then tap "Yes" / "Approve" in the app.`);
                    logger.step('══════════════════════════════════════════════════════');
                    logger.info('Waiting for phone approval (up to 120 seconds)...');

                    // Wait for the page to auto-advance after phone approval.
                    // The MFA page disappears and Microsoft redirects to the next step.
                    await Promise.race([
                        page.waitForSelector('.displaySign', { state: 'hidden', timeout: 120000 }),
                        page.waitForURL(url => !url.toString().includes('login.microsoftonline.com'), { timeout: 120000 }),
                        page.waitForSelector('text=/Stay signed in/i', { timeout: 120000 }),
                    ]);

                    logger.success('Phone approval received. Continuing login flow...');

                } else if (verificationScreen) {
                    // ── OTC / TOTP code (email / authenticator code) ──────────────────────
                    logger.warn('MFA/Verification screen detected.');
                    logger.step('A verification code is required. Please check your email or authenticator app.');

                    const code = await promptUser('Enter the verification code: ');

                    if (await page.locator('input[name="otc"]').isVisible()) {
                        await page.fill('input[name="otc"]', code);
                    } else if (await page.locator('input[type="tel"]').isVisible()) {
                        await page.fill('input[type="tel"]', code);
                    } else {
                        // Fallback: try to find any visible text input
                        await page.locator('input[type="text"]:visible, input[type="tel"]:visible').first().fill(code);
                    }

                    await page.click('input[type="submit"]');
                }
            } catch (e) {
                logger.debug(`Post-password verification handling skipped or failed: ${e.message}`);
            }
            // 2.7. Handle "Help protect your account" interrupt screen
            try {
                // This screen may appear after password entry
                const interruptPrompt = page.getByText(/Help protect your account/i).first();
                if (await interruptPrompt.isVisible({ timeout: 5000 }) || page.url().includes('account.live.com/interrupt/')) {
                    logger.info('Detected "Help protect your account" interrupt screen.');
                    const skipButton = page.getByRole('button', { name: /Skip for now/i })
                        .or(page.getByText(/Skip for now/i))
                        .first();
                    if (await skipButton.isVisible()) {
                        logger.info('Clicking "Skip for now"...');
                        await skipButton.click();
                    }
                }
            } catch (e) {
                logger.debug(`Help protect your account interrupt screen did not appear: ${e.message}`);
            }

            // 3. Handle "Stay signed in?" prompt if it appears
            try {
                // This step might not always appear depending on the account state
                logger.debug('Checking for "Stay signed in?" prompt...');

                // Use built-in locators for detection
                const staySignedIn = page.getByText(/Stay signed in?/i)
                    .or(page.locator('#KmsiDescription'))
                    .first();

                // Wait for the prompt with a reasonable timeout
                await staySignedIn.waitFor({ state: 'visible', timeout: 7000 });

                logger.info('Detected "Stay signed in?" prompt.');

                // Optionally check "Don't show this again" if it exists
                const dontShowAgain = page.locator('input[name="DontShowAgain"], #KmsiCheckboxField').first();
                if (await dontShowAgain.isVisible()) {
                    logger.debug('Checking "Don\'t show this again" checkbox...');
                    await dontShowAgain.check().catch(() => { });
                }

                // The provided HTML shows a button with text "Yes" and data-testid="primaryButton"
                const yesButton = page.getByRole('button', { name: /^Yes$/i })
                    .or(page.locator('button[data-testid="primaryButton"]'))
                    .or(page.locator('#idSIButton9'))
                    .first();

                logger.info('Clicking "Yes" to stay signed in...');
                await yesButton.click();
            } catch (e) {
                logger.debug(`Stay signed in prompt did not appear or was not recognized: ${e.message}`);
                // If we hit a timeout, it might just be the redirect already happened
            }

            // 4. Wait for redirection to notebooks list
            try {
                logger.info('Waiting for redirection to notebooks list...');

                // Wait for either the URL pattern or a success indicator in the DOM
                await Promise.any([
                    page.waitForURL(url => url.toString().includes('/notebooks') || url.hostname.includes('onenote.cloud.microsoft') || url.hostname.includes('onenote.com'), { timeout: 60000 }),
                    page.waitForSelector('text="My notebooks"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Create new notebook"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Welcome, "', { state: 'visible', timeout: 60000 })
                ]);

                logger.success('Notebooks list detected.');
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_notebooks.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.error(`Success detection failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }
        } else {
            logger.warn('Login flow requires manual interaction.');
            logger.step('>>> Once you see your Notebooks list in the browser, return here and press ENTER to continue. <<<');

            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            await new Promise(resolve => {
                rl.question('', () => {
                    rl.close();
                    resolve();
                });
            });
        }

        logger.info('Saving authentication state...');
        await context.storageState({ path: AUTH_FILE });
        
        // Persist email + time so that check command can show the logged-in user
        await fs.writeJson(AUTH_META_FILE, {
            email: email || 'manual login',
            loginTime: new Date().toISOString()
        });
        
        logger.success(`Authentication successful! State saved to ${AUTH_FILE}`);
    } catch (error) {
        logger.error('Authentication failed or cancelled:', error);
        if (isAutomated) {
            logger.debug('Possible cause: incorrect credentials, MFA requirement, or selector change.');
        }
    } finally {
        await browser.close();
    }
}

async function getAuthenticatedContext(browser) {
    if (await fs.pathExists(AUTH_FILE)) {
        return browser.newContext({ storageState: AUTH_FILE });
    } else {
        throw new Error('No authentication state found. Please run "login" command first.');
    }
}

async function checkAuth() {
    if (!(await fs.pathExists(AUTH_FILE))) {
        return false;
    }

    let browser;
    try {
        logger.debug('Verifying authentication session...');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ storageState: AUTH_FILE });
        const page = await context.newPage();

        // Go to OneNote URL
        await page.goto(ONENOTE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Wait briefly to allow client-side redirects to Microsoft login pages if session is dead
        await page.waitForTimeout(2000);

        const url = page.url();
        const isLoginUrl = url.includes('login.live.com') || url.includes('login.microsoftonline.com');

        if (isLoginUrl) {
            logger.warn('Authentication session has expired. Deleting stale auth state.');
            await logout();
            return false;
        }

        // Check for common error pages or other signs of invalid auth if necessary
        return true;
    } catch (e) {
        logger.debug(`Session verification encountered an error (timeout/network): ${e.message}`);
        // If we couldn't load the page properly due to network or timeout, 
        // we default to true to prevent accidentally logging out the user.
        return true;
    } finally {
        logger.debug(`Looks like user is logged in.`);
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Electron-aware login adapter.
 * Identical logic to login() but emits progress via sendEvent(type, payload)
 * instead of using readline stdin or the logger module.
 *
 * @param {object} credentials  - { login, password, notheadless, dodump }
 * @param {function} sendEvent  - (type, payload) => void — forwards events to the renderer
 * @param {object} ipcMain      - the electron ipcMain, used for OTC round-trip dialogs
 */
async function loginForElectron(credentials = {}, sendEvent, ipcMain) {
    const { login: email, password } = credentials;
    const isAutomated = !!(email && password);
    const headless = !credentials.notheadless && isAutomated;

    const log = (level, message) => sendEvent('log', { level, message });

    log('debug', 'Authentication Module: Version 4.4-DEBUG starting (Electron mode)...');

    if (isAutomated) {
        log('info', `Attempting automated login for ${email}...`);
    } else {
        log('info', 'Launching browser for manual authentication...');
        log('warn', 'Please log in to your Microsoft account in the browser window.');
        log('warn', 'The script will wait until you successfully reach the notebook list.');
    }

    const browser = await chromium.launch({ headless: !!headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(ONENOTE_URL);

        if (isAutomated) {
            log('step', 'Automating login steps...');

            // 0. Handle landing page
            try {
                const signInButton = page.getByRole('button', { name: 'Sign in' }).first();
                await signInButton.waitFor({ state: 'visible', timeout: 10000 });
                log('info', 'Landing page detected. Clicking "Sign in"...');
                await signInButton.click({ noWaitAfter: true });
                log('debug', 'Clicked "Sign in", waiting for login form...');
            } catch (e) {
                log('debug', 'Landing page not detected or "Sign in" button not found within timeout.');
            }

            // 1. Enter Email
            try {
                await page.waitForSelector('input[name="loginfmt"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="loginfmt"]', email);
                log('info', 'Email entered. Clicking "Next"...');
                await page.click('input[type="submit"]');
                log('debug', 'Waiting for email field to disappear...');
                await page.waitForSelector('input[name="loginfmt"]', { state: 'hidden', timeout: 15000 }).catch(() => {
                    log('debug', 'Email field still present, proceeding with caution.');
                });
                await page.waitForTimeout(1000);
                const usernameError = page.locator('#usernameError');
                if (await usernameError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await usernameError.textContent();
                    throw new Error(`Login Error (Username): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                log('error', `Failed to enter email: ${e.message}`);
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_email.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    log('error', `Email submission failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after email step (before MFA detection)
            if (credentials.dodump) {
                const debugFile = 'debug_after_email.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                log('debug', `[dodump] Post-email state dumped to ${debugFile}`);
            }

            // 1.5. Handle intermediate screens (MFA selection)
            try {
                const pageTitle = (await page.title()).trim();
                const pageHeading = (await page.locator('h1, [role="heading"]').first().textContent().catch(() => '')).trim();
                log('debug', `Settled State: Title="${pageTitle}" | Heading="${pageHeading}"`);
                log('debug', 'Checking for intermediate MFA/Sign-in option screens...');

                const result = await Promise.race([
                    page.waitForSelector('text=/Other ways to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Get a code to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Verify your identity/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                    page.waitForSelector('text=/Approve a request on my Microsoft Authenticator app/i', { state: 'visible', timeout: 5000 }).then(() => 'approve_app'),
                    page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 15000 }).then(() => 'password'),
                    page.waitForFunction(() => {
                        const h = document.querySelector('h1, [role="heading"]')?.textContent || '';
                        return h.includes('Get a code') || h.includes('Verify your identity');
                    }, { timeout: 15000 }).then(() => 'other_ways'),
                ]).catch((err) => {
                    log('debug', `Detection race timed out or failed: ${err.message}`);
                    return 'timeout';
                });

                log('debug', `Intermediate screen detection result: ${result}`);

                // Proactive dump when intermediate screen is reached
                if (credentials.dodump) {
                    const debugFile = 'debug_intermediate_screen.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    log('debug', `[dodump] Intermediate screen state dumped to ${debugFile}`);
                }

                if (result === 'other_ways' || pageHeading.includes('Get a code') || pageHeading.includes('Verify your identity')) {
                    log('info', 'Detected MFA/Verification screen. Attempting to locate "Other ways to sign in"...');
                    const otherWays = page.getByRole('button', { name: /Other ways to sign in|Sign in another way/i })
                        .or(page.getByText(/Other ways to sign in|Sign in another way/i)).first();
                    try {
                        await otherWays.waitFor({ state: 'attached', timeout: 15000 });
                        const isVisible = await otherWays.isVisible();
                        log('debug', `"Other ways" link visibility: ${isVisible}`);
                        log('info', 'Clicking "Other ways to sign in"...');
                        try {
                            await otherWays.click({ timeout: 5000 });
                        } catch (e) {
                            await otherWays.click({ force: true, timeout: 5000 });
                        }
                    } catch (e) {
                        log('warn', `MFA link interaction failed: ${e.message}`);
                        const clicked = await page.evaluate(() => {
                            const elements = Array.from(document.querySelectorAll('span, a, button'));
                            const target = elements.find(el =>
                                el.textContent.toLowerCase().includes('other ways to sign in') ||
                                el.textContent.toLowerCase().includes('sign in another way')
                            );
                            if (target) { target.click(); return true; }
                            return false;
                        });
                        if (!clicked && pageHeading.includes('Get a code')) {
                            throw new Error('STUCK: "Other ways to sign in" link not found even via JS scan.');
                        }
                    }
                    const subResult = await Promise.race([
                        page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('#idA_PWD_SwitchToPassword', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('text=/Select a verification method/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways_list'),
                    ]).catch(() => 'timeout');

                    if (subResult === 'use_password') {
                        log('info', 'Selecting "Use your password" option...');
                        await page.click('text=/Use your password/i');
                    } else if (subResult === 'other_ways_list') {
                        await page.click('text=/Password|Use your password/i');
                    }
                } else if (result === 'use_password') {
                    await page.click('text="Use your password"');
                } else if (result === 'approve_app') {
                    const otherLink = page.locator('text="Other ways to sign in", #signInAnotherWay').first();
                    if (await otherLink.isVisible()) {
                        await otherLink.click();
                        await page.waitForSelector('text="Use your password"', { state: 'visible', timeout: 10000 });
                        await page.click('text="Use your password"');
                    }
                }
            } catch (e) {
                log('debug', `Intermediate screen handler encountered a fatal issue: ${e.message}`);
            }

            // 2. Enter Password
            try {
                await page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="passwd"]', password);
                const submitButton = page.locator('input[type="submit"], button[type="submit"]').filter({ hasText: /Sign in|Next|Finish/i }).first();
                await submitButton.waitFor({ state: 'visible', timeout: 10000 });
                if (await submitButton.isDisabled()) { await page.waitForTimeout(1000); }
                await submitButton.click();
                const passwordError = page.locator('#passwordError');
                if (await passwordError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await passwordError.textContent();
                    throw new Error(`Login Error (Password): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_password.html';
                    await fs.writeFile(debugFile, await page.content().catch(err => `<!-- Error: ${err.message} -->`));
                    log('error', `Password entry failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after password submission (before post-password MFA check)
            if (credentials.dodump) {
                const debugFile = 'debug_after_password.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                log('debug', `[dodump] Post-password state dumped to ${debugFile}`);
            }

            // 2.5. Handle post-password MFA/Verification (OTC prompt via GUI dialog)
            //      Also handles Number Matching MFA (corporate accounts)
            try {
                const verificationScreen = await Promise.race([
                    page.waitForSelector('text="Verify your identity"', { timeout: 10000 }).then(() => 'verify'),
                    page.waitForSelector('text="Enter code"', { timeout: 10000 }).then(() => 'enter_code'),
                    page.waitForSelector('input[name="otc"]', { timeout: 10000 }).then(() => 'otc_input'),
                    // Number Matching MFA: corporate accounts show a number to enter in Authenticator
                    page.waitForSelector('text=/Approve sign in request/i', { timeout: 10000 }).then(() => 'number_match'),
                    page.waitForSelector('.displaySign', { timeout: 10000 }).then(() => 'number_match'),
                ]).catch(() => null);

                if (credentials.dodump) {
                    const debugFile = 'debug_post_password_mfa.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    log('debug', `[dodump] Post-password MFA screen state dumped to ${debugFile}`);
                }

                if (verificationScreen === 'number_match') {
                    // ── Number Matching MFA (corporate accounts) ──────────────────────────
                    // Microsoft shows a 2-digit number; user must enter it in Authenticator
                    // on their phone and tap OK — the page then auto-advances.
                    log('warn', 'Number Matching MFA detected ("Approve sign in request" screen).');

                    let matchNumber = '??';
                    try {
                        matchNumber = await page.$eval('.displaySign', el => el.textContent.trim());
                    } catch (_) {
                        log('debug', 'Could not extract number from .displaySign.');
                    }

                    // Notify the Electron renderer — it will show a waiting popup to the user
                    sendEvent('mfa-number-match', { number: matchNumber });
                    log('warn', `Number Matching MFA — user must enter ${matchNumber} in Microsoft Authenticator.`);

                    // Wait silently for phone approval to auto-advance the page (no browser action needed)
                    log('info', 'Waiting for phone approval (up to 120 seconds)...');
                    await Promise.race([
                        page.waitForSelector('.displaySign', { state: 'hidden', timeout: 120000 }),
                        page.waitForURL(url => !url.toString().includes('login.microsoftonline.com'), { timeout: 120000 }),
                        page.waitForSelector('text=/Stay signed in/i', { timeout: 120000 }),
                    ]);

                    log('success', 'Phone approval received. Continuing login flow...');
                    sendEvent('mfa-number-match-approved', {});

                } else if (verificationScreen) {
                    // ── OTC / TOTP code prompt ─────────────────────────────────────────────
                    log('warn', 'MFA/Verification screen detected.');
                    log('step', 'A verification code is required. Please check your email or authenticator app.');

                    // Ask the renderer to show the OTC dialog and wait for user input via IPC
                    sendEvent('otc-required', {});
                    const code = await new Promise((resolve) => {
                        ipcMain.once('otc-reply', (event, value) => resolve(value));
                    });

                    if (await page.locator('input[name="otc"]').isVisible()) {
                        await page.fill('input[name="otc"]', code);
                    } else if (await page.locator('input[type="tel"]').isVisible()) {
                        await page.fill('input[type="tel"]', code);
                    } else {
                        await page.locator('input[type="text"]:visible, input[type="tel"]:visible').first().fill(code);
                    }
                    await page.click('input[type="submit"]');
                }
            } catch (e) {
                log('debug', `Post-password verification handling skipped or failed: ${e.message}`);
            }
            // 2.7. Handle "Help protect your account" interrupt screen
            try {
                const interruptPrompt = page.getByText(/Help protect your account/i).first();
                if (await interruptPrompt.isVisible({ timeout: 5000 }) || page.url().includes('account.live.com/interrupt/')) {
                    log('info', 'Detected "Help protect your account" interrupt screen.');
                    const skipButton = page.getByRole('button', { name: /Skip for now/i })
                        .or(page.getByText(/Skip for now/i))
                        .first();
                    if (await skipButton.isVisible()) {
                        log('info', 'Clicking "Skip for now"...');
                        await skipButton.click();
                    }
                }
            } catch (e) {
                log('debug', `Help protect your account interrupt screen did not appear: ${e.message}`);
            }

            // 3. Handle "Stay signed in?" prompt
            try {
                const staySignedIn = page.getByText(/Stay signed in?/i).or(page.locator('#KmsiDescription')).first();
                await staySignedIn.waitFor({ state: 'visible', timeout: 7000 });
                log('info', 'Detected "Stay signed in?" prompt.');
                const dontShowAgain = page.locator('input[name="DontShowAgain"], #KmsiCheckboxField').first();
                if (await dontShowAgain.isVisible()) { await dontShowAgain.check().catch(() => { }); }
                const yesButton = page.getByRole('button', { name: /^Yes$/i })
                    .or(page.locator('button[data-testid="primaryButton"]'))
                    .or(page.locator('#idSIButton9')).first();
                log('info', 'Clicking "Yes" to stay signed in...');
                await yesButton.click();
            } catch (e) {
                log('debug', `Stay signed in prompt did not appear: ${e.message}`);
            }

            // 4. Wait for redirect to notebooks list
            try {
                log('info', 'Waiting for redirection to notebooks list...');
                await Promise.any([
                    page.waitForURL(url => url.toString().includes('/notebooks') || url.hostname.includes('onenote.cloud.microsoft') || url.hostname.includes('onenote.com'), { timeout: 60000 }),
                    page.waitForSelector('text="My notebooks"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Create new notebook"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Welcome, "', { state: 'visible', timeout: 60000 })
                ]);
                log('success', 'Notebooks list detected.');
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_notebooks.html';
                    await fs.writeFile(debugFile, await page.content().catch(err => `<!-- Error: ${err.message} -->`));
                    log('error', `Success detection failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }
        } else {
            // Manual login: tell the renderer to show the "waiting" state
            log('warn', 'Manual login flow — please log in in the browser window that just opened.');
            sendEvent('manual-login-ready', {});
            // Wait for the renderer to send 'manual-login-confirmed' (user clicks "I've logged in" button)
            await new Promise((resolve) => {
                ipcMain.once('manual-login-confirmed', () => resolve());
            });
        }

        log('info', 'Saving authentication state...');
        await context.storageState({ path: AUTH_FILE });
        // Persist email + time so the GUI can show "Logged in as X since HH:MM"
        await fs.writeJson(AUTH_META_FILE, {
            email: email || 'manual login',
            loginTime: new Date().toISOString()
        });
        log('success', `Authentication successful! State saved to ${AUTH_FILE}`);
        return { success: true, email: email || 'manual login', loginTime: new Date().toISOString() };
    } catch (error) {
        log('error', `Authentication failed or cancelled: ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}

module.exports = {
    login,
    loginForElectron,
    getAuthenticatedContext,
    checkAuth,
    getAuthMeta,
    logout
};
```
