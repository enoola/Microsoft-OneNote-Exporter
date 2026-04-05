# Fix "Open Output Folder" Button in Electron GUI

The "Open Output Folder" button in the Electron GUI is currently non-functional. Investigation suggests the IPC handler in `main.js` lacks error handling and may be failing silently.

## User Review Required

> [!IMPORTANT]
> Change the IPC handler to `await shell.openPath(folderPath)` and return the result to the renderer for robust error handling.

## Proposed Changes

### Electron Main Process

#### [MODIFY] [main.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/electron/main.js)
- Update the `open-output-folder` IPC handler:
    ```javascript
    ipcMain.handle('open-output-folder', async (_event, folderPath) => {
        if (!folderPath) return { success: false, error: 'No path provided' };
        try {
            const error = await shell.openPath(folderPath);
            if (error) {
                // If openPath failed (e.g. folder mission), try to reveal the parent
                shell.showItemInFolder(folderPath);
                return { success: false, error };
            }
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    });
    ```

### Electron Renderer Process

#### [MODIFY] [renderer.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/electron/renderer/renderer.js)
- Update the click listener for `btnOpenOutput`:
    ```javascript
    btnOpenOutput.addEventListener('click', async () => {
        if (exportOutputDir) {
            const result = await window.electronAPI.invoke('open-output-folder', exportOutputDir);
            if (result && !result.success) {
                appendLog(exportLog, 'warn', `Could not open folder: ${result.error}`);
            }
        }
    });
    ```

## Open Questions

None.

## Verification Plan

### Manual Verification
1. Run a notebook export in the Electron GUI.
2. Click the "Open Output Folder" button when it appears.
3. Verify that the folder opens in Finder (macOS) or Explorer (Windows).
4. Verify that if the folder is missing, a warning message appears in the GUI log.
