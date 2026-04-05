# Add Notebook Link Export to Electron GUI

This plan outlines the changes needed to allow users to export a notebook by providing its direct URL in the Electron application, bypassing the notebook selection list.

## Proposed Changes

### [Component] Backend (src)

#### [MODIFY] [exporter.js](src/exporter.js)
- Update `runExportForElectron` to check for `options.notebookLink`.
- If `notebookLink` is present, use `openNotebookByLink` (similar to `runExport` CLI logic) instead of listing notebooks and calling `openNotebook`.
- Ensure all logging and progress events still work correctly in this mode.

---

### [Component] Frontend (electron/renderer)

#### [MODIFY] [index.html](electron/renderer/index.html)
- Update the "Notebook Selection" card to include a toggle or choice between "Select from list" and "Enter direct link".
- Add a new input field for the Notebook URL.
- Add unique IDs for new elements.

#### [MODIFY] [styles.css](electron/renderer/styles.css)
- Add styles for the selection toggle (e.g., segmented control or simple button group).
- Style the "Direct Link" input field to match the rest of the UI.
- Handle showing/hiding fields based on the selected mode.

#### [MODIFY] [renderer.js](electron/renderer/renderer.js)
- Add event listeners for the mode toggle.
- Update `btnExport` logic:
    - If "Select from list" mode is active, ensure a notebook is selected.
    - If "Direct Link" mode is active, ensure a URL is entered.
    - Pass `notebookLink` instead of `notebook` in the `start-export` IPC call if applicable.

## Verification Plan

### Automated Tests
- N/A (UI-driven change)

### Manual Verification
1. Launch the app: `npm run electron:dev`.
2. Login.
3. Go to the Export page.
4. Verify the new toggle is present.
5. **Mode 1: List Selection**
   - Click "Refresh list".
   - Select a notebook.
   - Click "Start Export".
   - Verify it works as before.
6. **Mode 2: Direct Link**
   - Switch to "Direct Link" mode.
   - Enter a valid OneNote notebook URL.
   - Click "Start Export".
   - Verify the export starts and completes successfully.
7. **Negative Test**
   - Try to export with an empty link in "Direct Link" mode.
   - Verify a warning message appears.
