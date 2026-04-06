// electron/preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    /**
     * Invoke a main-process IPC handler and get a result.
     * @param {string} channel
     * @param {...any} args
     */
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

    /**
     * Subscribe to streamed events from the main process.
     * Returns an unsubscribe function.
     * @param {function} callback - called with ({ type, payload })
     */
    onMainEvent: (callback) => {
        const handler = (_event, data) => callback(data);
        ipcRenderer.on('main-event', handler);
        return () => ipcRenderer.removeListener('main-event', handler);
    },

    /**
     * Send a one-way message to the main process (for OTC and unlock replies).
     * @param {string} channel
     * @param {...any} args
     */
    send: (channel, ...args) => {
        const allowed = ['otc-reply', 'manual-login-confirmed', 'section-unlocked', 'log-message'];
        if (allowed.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        }
    }
});
