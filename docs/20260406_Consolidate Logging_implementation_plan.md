# Consolidated Logging Plan

The goal is to implement a unified logging system that captures all activity from both the CLI and the Electron GUI into a single log file located at `logs/app.log`, while maintaining existing terminal and UI output.

## User Review Required

> [!IMPORTANT]
> The log file will be located at `logs/app.log`. This file will be appended to on each run. If you prefer a different filename or a rotating log system, please let me know.

## Proposed Changes

### [Component] Core Logger Utility

#### [MODIFY] [logger.js](file:///Users/enola/Workspace//src/utils/logger.js)
- Initialize a persistent log file at `logs/app.log`.
- Add logic to strip ANSI/Chalk color codes before writing to the file.
- Update all logging methods (`info`, `warn`, `error`, `success`, `debug`, `step`) to write to both the terminal (with colors) and the log file (plain text).
- The log file format will be: `[Month Day Time] [LEVEL] Message` (matching the user's requested example).

---

### [Component] Electron Integration

#### [MODIFY] [preload.js](file:///Users/enola/Workspace//electron/preload.js)
- Allow the `log-message` IPC channel to be sent from the renderer.

#### [MODIFY] [main.js](file:///Users/enola/Workspace//electron/main.js)
- Handle the `log-message` IPC event and route it to the `Logger` utility.

#### [MODIFY] [renderer.js](file:///Users/enola/Workspace//electron/renderer/renderer.js)
- Update `appendLog` to send logs to the main process for filing, but only for logs that didn't originate from the main process (to avoid duplication).

---

### [Component] Backend Logic

#### [MODIFY] [auth.js](file:///Users/enola/Workspace//src/auth.js)
- In `loginForElectron`, update the internal `log` helper to call the `Logger` utility, ensuring these logs are recorded in the terminal and file.

#### [MODIFY] [exporter.js](file:///Users/enola/Workspace//src/exporter.js)
- In `runExportForElectron`, update the internal `log` helper to call the `Logger` utility.

## Open Questions

- Should the log file be cleared on every run, or should it append indefinitely? (Currently planning to append).

## Verification Plan

### Automated Tests
- Run `npm test` to ensure existing logic remains sound.

### Manual Verification
1. **CLI Mode**: Run `node src/index.js` (or any command) and check if `logs/app.log` contains the output.
2. **Electron Mode**: Launch the GUI, perform a login and an export. Verify that:
   - Logs appear in the GUI log panels.
   - Logs appear in the terminal where Electron was started.
   - Logs are appended to `logs/app.log` in the correct format.
