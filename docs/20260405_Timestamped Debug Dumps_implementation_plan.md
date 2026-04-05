# Implementation Plan: Timestamped Debug Dumps

Organize debug HTML dumps into a timestamped directory structure to avoid overwriting dumps from previous runs and maintain a clean `logs/` directory.

## User Review Required

> [!IMPORTANT]
> The dump directory path will now follow the format: `logs/dumps/<YYYY-MM-DD_HH:mm>/<filename>.html`.
> `:` is used in the directory name as requested (`h:m`). On some filesystems (like Windows), this might be problematic, but it works on macOS.

## Proposed Changes

### [Component] Core Logger Utilities

#### [MODIFY] [logger.js](src/utils/logger.js)
- Add `getDumpDir()` method to the `Logger` class.
- Initialize a `startTime` timestamp when the logger is first loaded.
- `getDumpDir()` will:
    - Compute the path: `logs/dumps/YYYY-MM-DD_HH:mm/`.
    - Ensure the directory exists using `fs-extra`.
    - Returns the absolute path and a "display path" for logging purposes.

---

### [Component] Navigation and Exporter

#### [MODIFY] [navigator.js](src/navigator.js)
#### [MODIFY] [auth.js](src/auth.js)
#### [MODIFY] [exporter.js](src/exporter.js)
- Replace local `path.resolve(__dirname, '../logs')` logic with `await logger.getDumpDir()`.
- Update error and warning messages to show the relative path where files are being dumped.
- Ensure `fs-extra` is used for writing.

## Open Questions

- **Timestamp Format**: You requested `h:m`. Should I use leading zeros (e.g., `2026-04-05_19:34`) or literal single digits if applicable? (I recommend `HH:mm` for better lexicographical sorting).
- **Illegal Characters**: `:` is allowed on macOS but not on Windows. Since you are on Mac, I will use it. Is that acceptable? 
    => no prefer `h` char rather than `:` char

## Verification Plan

### Automated Tests
- Run `onenote-export login --dodump` and verify a new directory is created under `logs/dumps/` with the correct timestamp.
- Run `onenote-export list --dodump` and verify dumps go into the same directory or a new one if it's a new execution.

### Manual Verification
- Check the `logs/` folder structure in Finder.
- Verify that multiple dumps from the same run go into the same subfolder.
