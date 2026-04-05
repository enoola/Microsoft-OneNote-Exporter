# Implementation Plan: Add "do dump" Checkbox for Debugging

This plan adds a "do dump while processing (useful for debug)" checkbox to each dynamic view (Login and Export) in the Electron application. When checked, it passes the `--dodump` flag to the underlying Playwright logic, which saves HTML snapshots of the pages being processed.

## User Review Required

> [!IMPORTANT]
> The "do dump" feature creates HTML files in the application's root directory (or respective group/section directories during export). These are primarily for debugging purposes and can take up space if left enabled.

## Proposed Changes

### Electron Renderer

#### [MODIFY] [index.html](electron/renderer/index.html)
- Add a checkbox with ID `login-dodump` to the Automated Login card in the Login view.
- Add a checkbox with ID `export-dodump` to the Export Options card in the Export view.

#### [MODIFY] [renderer.js](electron/renderer/renderer.js)
- Get DOM references for the new checkboxes.
- Update `doLogin` to include `dodump` in the credentials passed to `start-login`.
- Update `loadNotebooks` to include `dodump` in the options passed to `list-notebooks`.
- Update the export button click handler to include `dodump` in the options passed to `start-export`.

### Electron Main Process

#### [MODIFY] [main.js](electron/main.js)
- Update the `list-notebooks` IPC handler to accept `options` from the renderer and pass them to the `listNotebooks` function.

### Backend Logic

#### [MODIFY] [exporter.js](src/exporter.js)
- Implement `dodump` logic in `runExportForElectron` (dumping the notebook content frame).
- Implement `dodump` logic in `processSectionsElectron` (dumping group and page HTML).

## Verification Plan

### Automated Tests
- No new automated tests are planned as this is a UI/debugging feature.

### Manual Verification
1. **Login View**: Check "do dump", attempt a login. Verify that `debug_after_email.html`, `debug_after_password.html`, etc. are created in the workspace root.
2. **Export Section**:
    - Select "Export from List". Check "do dump". Click "Refresh list". Verify `debug_page_dump.html` and `debug_frame_dump.html` are created.
    - Start an export. Verify that `debug_notebook_content.html` and individual page dumps (e.g., `debug_page_*.html`) are created in the respective output/debug locations.
3. **Export from URL**: Enter a URL, check "do dump", start export. Verify dumps are created.
