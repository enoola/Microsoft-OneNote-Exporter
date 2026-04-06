# Implementation Plan - Unified Logging in downloadStrategies.js

This plan outlines the steps to integrate the central `Logger` utility into `downloadStrategies.js`, ensuring consistent logging across the application and correct routing to logs, terminal, and GUI.

## User Review Required

> [!IMPORTANT]
> This change replaces all direct `console` calls in `downloadStrategies.js` with `Logger` methods. This will change the colors of some log messages to match the application's standard logging style (e.g., cyan messages might become blue or gray depending on the chosen `Logger` method).

## Proposed Changes

### Core Logic

#### [MODIFY] [downloadStrategies.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/downloadStrategies.js)
- Import `Logger` from `./utils/logger`.
- Remove `chalk` dependency as it's now handled by `Logger`.
- Replace `console.log`, `console.debug`, and `console.error` with `Logger.info`, `Logger.debug`, `Logger.success`, `Logger.warn`, and `Logger.error`.

## Open Questions

- None at this time.

## Verification Plan

### Automated Tests
- I will run the application in a test mode (if available) or check if the code compiles and the `Logger` is correctly invoked.
- Since this is a logging change, I will primarily verify by visual inspection of the code and ensuring no `console` calls remain.

### Manual Verification
- I will simulate or trigger a download (if possible in the environment) to verify logs appear in the terminal and `app.log`.
