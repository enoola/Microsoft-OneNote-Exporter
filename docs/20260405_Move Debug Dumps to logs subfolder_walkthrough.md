# Move Debug Dumps to logs/ Subfolder

I have successfully updated the backend logic to save all debug HTML dumps generated with the `--dodump` option into a dedicated `logs/` subfolder at the project root.

## Changes Made

### Console & Electron Backend
- **[src/exporter.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/exporter.js)**: Updated all paths for group, page, and notebook content dumps to use the `logs/` directory.
- **[src/navigator.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/navigator.js)**: Updated paths for notebook listing and frame dumps to use the `logs/` directory.
- **[src/auth.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/auth.js)**: Added `path` dependency and updated all login-related debug dumps to save into the `logs/` directory.

### Robustness
- Added `fs.ensureDir` before every dump call to ensure the `logs/` directory exists even if it was manually deleted.
- Standardized paths using `path.resolve(__dirname, '../logs')` to ensure consistency between CLI and Electron environments.

## Verification Results

### CLI Verification
- Ran `node src/index.js login --dodump` and confirmed that the `logs/` directory was automatically created in the project root.
- Verified that debug files are being directed to this folder.

### GUI Verification
- The changes in `src/exporter.js` and `src/auth.js` apply directly to the Electron GUI, as it uses the same functions.

> [!NOTE]
> The root directory will now remain clean, with all troubleshooting artifacts consolidated in the `logs/` folder.
