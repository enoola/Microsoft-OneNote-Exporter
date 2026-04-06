# Implementation Plan - Add Waiting Period Logging

The user wants to improve the transparency of the export process by adding log lines whenever the application enters a waiting period (e.g., `waitForTimeout`).

## User Review Required

> [!IMPORTANT]
> The log message "Will wait `n seconds` to let the document load properly" will be applied to all significant waiting periods found, even if the internal comment suggests a more specific reason (like "wait for animation"). This is to maintain the consistency requested by the user.

## Proposed Changes

I will update multiple files to include the requested log line before `waitForTimeout` or manual `setTimeout` delays. I will calculate the number of seconds from the millisecond values.

### [Component] JavaScript Source Files

I will modify the following files to add `logger.info(`Will wait ${n} seconds to let the document load properly`)` before waiting calls.

#### [MODIFY] [exporter.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/exporter.js)
- Add log lines before all `waitForTimeout` calls (lines 89, 100, 115, 122, 158, 180, 333, 425, 533, 543, 558, 561, 589, 609, 712, 789).

#### [MODIFY] [navigator.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/navigator.js)
- Add log lines before `waitForTimeout` calls (lines 111, 201, 252, 302).

#### [MODIFY] [downloadStrategies.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/downloadStrategies.js)
- Add log lines before `waitForTimeout` calls (lines 75, 115, 133, 157, 253).

#### [MODIFY] [auth.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/auth.js)
- Add log lines before `waitForTimeout` calls (lines 106, 281, 523, 609, 731).

#### [MODIFY] [utils/retry.js](file:///Users/enola/Workspace/20260205_MSOneNoteExporter/src/utils/retry.js)
- Add a log line before the retry delay (line 48). Since `delayMs` can be small (e.g. 500ms), I will format it as seconds (e.g. "0.5 seconds").

## Open Questions

- Should I skip log lines for very short waits (e.g., <= 1 second)? 
  - *Decision*: I will include them if they use `waitForTimeout`, as they still represent a pause in the process.

## Verification Plan

### Automated Tests
- I will run a dry-run or a small extraction to verify the logs appear in the terminal and `app.log`.
- `npm start` (if usable) or running the CLI with a dummy link.

### Manual Verification
- Verify the output format matches `[Month DD HH:MM:SS] [INFO] Will wait n seconds to let the document load properly`.
