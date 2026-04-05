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
