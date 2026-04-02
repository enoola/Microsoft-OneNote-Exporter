# Standardized Terminal Output Walkthrough
2026/04/01
Terminal output has been standardized across the application using a new unified logger.

## Changes Made
- Created [src/utils/logger.js](src/utils/logger.js).
- Integrated logger into:
    - [index.js](src/index.js)
    - [auth.js](src/auth.js)
    - [navigator.js](src/navigator.js)
    - [exporter.js](src/exporter.js)
    - [scrapers.js](src/scrapers.js)
    - [retry.js](src/utils/retry.js)

## Verification Results

### New Format Pattern
All logs now follow this pattern:
`[MMM DD HH:mm:ss] [LEVEL] Message`

### Terminal Output Example
Running `onenote-export check`:
```text
[Feb 07 22:33:59] [SUCCESS] Authentication file found.
```

### Bug Fixes
- Fixed `ReferenceError: logger is not defined` in [src/scrapers.js](src/scrapers.js) by replacing `logger` calls with `console.debug` inside `frame.evaluate` blocks. This ensures scraper debugging doesn't crash when running in the browser context.

### Automated Tests
Existing tests for parsing and link resolution passed successfully, ensuring no regressions.
```text
PASS  test/parser.test.js
PASS  test/linkResolver.test.js
Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
```
