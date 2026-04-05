# Electron GUI Dual-Mode Implementation Plan

Wrap the existing CLI in an Electron shell so everyday users get a clickable GUI (Login, notebook selection, Export, live progress), while the original `node src/index.js` CLI remains fully intact.

---

## Proposed Changes

### Backend Adapters (`src/`)

The existing [auth.js](src/auth.js) and [exporter.js](src/exporter.js) use `readline` stdin prompts and the `logger` module for output — neither of which works inside Electron's main process.
The strategy is to **add** Electron-aware variants that accept a `sendEvent(type, payload)` callback; the original functions remain untouched.

#### [MODIFY] [auth.js](src/auth.js)
- Export a new `loginForElectron(credentials, sendEvent)` function.
- Replaces `readline` OTC prompt with an IPC round-trip: emits `{ type: 'otc-required' }` → waits on a one-shot IPC reply from the renderer form.
- Replaces `logger.*` calls with `sendEvent('log', { level, message })`.
- The manual "press Enter" flow in non-automated path becomes `sendEvent('manual-login-ready')` + waiting for an IPC `'manual-login-confirmed'` from the GUI button.

#### [MODIFY] [exporter.js](src/exporter.js)
- Export a new `runExportForElectron(options, sendEvent)` function.
- Replaces all `logger.*` calls with `sendEvent('log', ...)`.
- Emits `sendEvent('progress', { current, total, pageName })` each time a page is saved.
- Emits `sendEvent('export-complete', { totalPages, totalAssets, outputDir })` on finish.
- The [waitForEnter](src/exporter.js#46-58) password-section unlock becomes a GUI dialog via IPC (emit `'section-locked'`, await `'section-unlocked'`).

#### [MODIFY] [navigator.js](src/navigator.js)
- Export a new `listNotebooksForElectron(sendEvent)` — thin wrapper that calls [listNotebooks({ keepOpen: true })](src/navigator.js#8-141) and forwards logger output via `sendEvent('log', ...)`.
- No structural change needed since it already supports `keepOpen`.

---

### Electron Layer (`electron/`)

#### [MODIFY] [main.js](electron/main.js)
Full rewrite of the stub. Key responsibilities:
- [createWindow()](electron/main.js#8-21) → `BrowserWindow` 900×650, dark background, `preload.js`.
- `ipcMain.handle('start-login', ...)` → calls `loginForElectron`, streams events back via `webContents.send`.
- `ipcMain.handle('start-list-notebooks', ...)` → calls `listNotebooksForElectron`, returns notebook array.
- `ipcMain.handle('start-export', ...)` → calls `runExportForElectron`, streams progress events back.
- `ipcMain.handle('check-auth', ...)` → calls [checkAuth()](src/auth.js#386-389).
- Handles OTC / section-lock round-trips where the main process waits for a reply IPC from renderer.
- `app.on('window-all-closed')` / `activate` lifecycle hooks.

#### [NEW] [preload.js](electron/preload.js)
`contextBridge.exposeInMainWorld('electronAPI', { ... })` exposing:
- `invoke(channel, ...args)` → `ipcRenderer.invoke`
- [on(channel, callback)](src/utils/logger.js#4-7) → `ipcRenderer.on` (returns unsubscribe fn)
- `send(channel, ...args)` → `ipcRenderer.send` (for OTC/unlock replies)

#### [NEW] [renderer/index.html](electron/renderer/index.html)
Premium dark-mode single-page UI:
- **Header**: App name + status badge ("Not logged in" / "Logged in")
- **Login Panel**: Email + Password inputs (optional, for automated login), Login button, manual-login instruction
- **Notebook Panel** (shown after login): Dropdown list of notebooks, Export button, Options (headless toggle, `--nopassasked`)
- **Progress Panel**: Progress bar (%), log console (scrollable, coloured by level), Done/Error states
- **OTC Dialog**: Modal overlay asking for verification code input

#### [NEW] [renderer/styles.css](electron/renderer/styles.css)
- Dark background (`#0f0f13`), glassmorphism cards, accent colour `#7c6af7` (purple-violet)
- Google Font **Inter**
- Smooth transitions for panel visibility, button hover, progress bar animation
- Coloured console lines matching log level (info=blue, warn=yellow, error=red, success=green)

#### [NEW] [renderer/renderer.js](electron/renderer/renderer.js)
DOM wiring:
- [checkAuth()](src/auth.js#386-389) on load → update status badge
- Login button → `invoke('start-login', credentials)` → listen for streamed log events → update status
- After login success → `invoke('start-list-notebooks')` → populate notebook dropdown
- Export button → `invoke('start-export', options)` → update progress bar and log console from streamed events
- OTC dialog submit → `send('otc-reply', code)`
- Section-lock dialog → `send('section-unlocked')`

---

### Package Configuration

#### [MODIFY] [package.json](package.json)
- Add to `devDependencies`: `"electron": "^30.0.0"`, `"electron-builder": "^25.0.0"`
- Add `build` config block for `electron-builder`:
  ```json
  "build": {
    "appId": "com.onenote.exporter",
    "productName": "OneNote Exporter",
    "files": ["electron/**/*", "src/**/*", "node_modules/**/*"],
    "directories": { "output": "dist" },
    "mac": { "target": "dmg" },
    "win": { "target": "nsis" },
    "linux": { "target": "AppImage" }
  }
  ```
- Scripts already have `electron:dev` and `electron:build` — no change needed there.

> [!IMPORTANT]
> `electron` and `electron-builder` will need to be installed via `npm install --save-dev electron electron-builder`. This command will be run as part of the implementation.

---

## Verification Plan

### Automated Tests
Existing tests cover CLI-layer logic (`linkResolver`, `parser`) and don't touch auth/exporter internals. They will continue to pass — verify with:
```bash
cd /Users/enola/Workspace/20260205_MSOneNoteExporter
npm test
```

### CLI Smoke Test (unchanged behaviour)
```bash
node src/index.js --help
node src/index.js check
```
Both should work identically before and after the changes.

### Electron Dev Launch (Manual)
```bash
npm run electron:dev
```
- The Electron window opens showing the dark-mode UI (no errors in the DevTools console)
- "Check Auth" status badge shows correct state (logged in / not)
- Login panel renders with Email, Password fields and a Login button
- Notebook dropdown and Export panel are hidden until logged in

### Full GUI Flow (Manual — requires a Microsoft account)
1. Run `npm run electron:dev`
2. Enter credentials (or leave blank for manual browser login) → click **Login**
3. Log console shows progress; status badge changes to "Logged in" 
4. Notebook dropdown populates automatically
5. Select a notebook → click **Export**
6. Progress bar advances; log console shows page names as they're exported
7. Completion message shows total pages/assets and output folder path

### Build (Optional Packaging Verification)
```bash
npm run electron:build
```
- `dist/` folder is created containing a `.dmg` (macOS), `.exe` installer (Windows, if on Windows), or `.AppImage` (Linux)
