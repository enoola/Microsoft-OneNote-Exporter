const path = require('path');

// When running as a packaged Electron app, __dirname points inside the
// read-only app.asar archive, so we must write auth/export files to the
// OS-provided writable userData directory instead.
// In CLI / dev mode (no Electron), we fall back to the project root.
function getUserDataDir() {
    try {
        const { app } = require('electron');
        // app.getPath throws if called before app is ready, but by the time
        // config.js is required in main.js the app is always ready.
        return app.getPath('userData');
    } catch (_) {
        // Not running inside Electron (CLI usage)
        return path.resolve(__dirname, '..');
    }
}

const USER_DATA_DIR = getUserDataDir();

const AUTH_FILE = path.join(USER_DATA_DIR, 'auth.json');
const EXPORT_DIR = path.join(USER_DATA_DIR, 'export');
const ONENOTE_URL = 'https://www.onenote.com/notebooks';

module.exports = {
    AUTH_FILE,
    EXPORT_DIR,
    ONENOTE_URL,
    USER_DATA_DIR,
};
