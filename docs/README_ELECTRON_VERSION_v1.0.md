# Electron GUI Dual-Mode — Implementation Walkthrough

The OneNote Exporter now ships in two modes:  
- **CLI Mode** — unchanged: `node src/index.js` / `npm start`  
- **Electron Mode** — new: `npm run electron:dev` (development) · `npm run electron:build` (package)

---

## What Was Built

### New files

| File | Purpose |
|------|---------|
| [electron/main.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/electron/main.js) | Electron main process — BrowserWindow, IPC handlers, app lifecycle |
| [electron/preload.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/electron/preload.js) | `contextBridge` bridge (secure IPC to renderer) |
| [electron/renderer/index.html](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/electron/renderer/index.html) | Single-page dark-mode UI |
| [electron/renderer/styles.css](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/electron/renderer/styles.css) | Premium CSS — dark `#0f0f13` bg, `#7c6af7` accent, glassmorphism cards |
| [electron/renderer/renderer.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/electron/renderer/renderer.js) | UI logic: view switching, form handling, streaming event display |

### Modified files

| File | What changed |
|------|-------------|
| [src/auth.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/auth.js) | Added [loginForElectron(credentials, sendEvent, ipcMain)](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/auth.js#390-636) — identical flow to [login()](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/auth.js#21-377) but uses `sendEvent` callbacks and IPC round-trips instead of `readline`/`logger` |
| [src/exporter.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/exporter.js) | Added [runExportForElectron(options, sendEvent, ipcMain)](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/exporter.js#417-683) — full export loop with progress events streamed to renderer |
| [package.json](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/package.json) | Added `electron-builder` `build` config (appId, files, mac/win/linux targets), platform-specific build scripts |

### IPC architecture

```
Renderer (UI)          Preload bridge         Main process          src/ adapters
─────────────          ──────────────         ────────────          ─────────────
click Login  ──────▶  invoke('start-login') ──▶  loginForElectron()
                                                     │ sendEvent('log',…) ──▶  webContents.send ──▶  onMainEvent(log)
OTC input ──────────▶  send('otc-reply')   ──▶  ipcMain.once('otc-reply')
click Export ──────▶  invoke('start-export')──▶  runExportForElectron()
                                                     │ sendEvent('progress',…)──▶ progress bar update
```

---

## Screenshot — Login View

![Electron Login UI](/Users/enola/.gemini/antigravity/brain/c88d2795-48c2-490a-99ce-506695f6eeb8/electron_ui_login.png)

---

## Verification Results

| Check | Result |
|-------|--------|
| `npm test` | ✅ 22/22 tests pass |
| `node src/index.js --help` | ✅ CLI works unchanged |
| JS syntax check (all 3 electron files) | ✅ No errors |
| Electron UI renders | ✅ Dark sidebar, login cards, auth badge, activity log |

---

## How to Use

```bash
# Development (GUI)
npm run electron:dev

# Package for current platform
npm run electron:build

# Package per platform
npm run electron:build:mac    # → dist/*.dmg
npm run electron:build:win    # → dist/*-Setup.exe
npm run electron:build:linux  # → dist/*.AppImage

# CLI (unchanged)
npm start login --login you@outlook.com --password secret
npm start export --notebook "My Notebook"
```

## GUI Flow

1. **`npm run electron:dev`** — window opens at the Login view
2. Enter email + password → **Login** — Playwright automates Microsoft sign-in; logs stream to Activity Log
3. On success the app auto-switches to **Export**, notebook dropdown loads
4. Select a notebook → **Start Export** — progress bar and log update live
5. When done, **📂 Open Output Folder** button reveals the exported Markdown
