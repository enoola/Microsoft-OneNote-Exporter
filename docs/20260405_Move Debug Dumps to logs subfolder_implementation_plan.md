# Move Debug Dumps to logs/ Subfolder

The current implementation of the `--dodump` option saves debug HTML files directly in the project root. This plan aims to consolidate these files into a `logs/` subfolder.

## Proposed Changes

### [Component] src/utils/logger.js (Optional but Recommended)
Maybe I can add a helper here? Or just handle it in each file.
Actually, I'll just handle it in each file to keep it simple, or better, I can check if there is a central place.
Actually, `src/exporter.js`, `src/auth.js`, and `src/navigator.js` all use `fs-extra` and `path`. Standardizing them to use a consistent path from the root is best.

---

### [Component] Backend Logic

#### [MODIFY] [src/exporter.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/exporter.js)
- Update all `dodump` blocks to use `path.resolve(__dirname, '../logs/debug_...')`.
- Ensure the `logs/` directory exists before writing using `fs.ensureDir`.

#### [MODIFY] [src/navigator.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/navigator.js)
- Update all `dodump` blocks to use `path.resolve(__dirname, '../logs/debug_...')`.
- Ensure the `logs/` directory exists before writing.

#### [MODIFY] [src/auth.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/auth.js)
- Import `path` module.
- Update all `dodump` blocks to use `path.resolve(__dirname, '../logs/debug_...')`.
- Ensure the `logs/` directory exists before writing.

---

## Verification Plan

### Automated Tests
- Run the CLI with `--dodump` and verify files are created in `logs/`.
  - `node src/index.js login --login "..." --password "..." --dodump` (and check `logs/`)
  - `node src/index.js export --dodump` (and check `logs/`)
- Run the Electron app, enable the "Debug Dumps" checkbox, and verify files are created in `logs/`.

### Manual Verification
- Check that the project root remains clean and all debug files are correctly categorized in `logs/`.
