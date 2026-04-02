# Task: MFA Number Matching + `--dodump` Fix

## `src/auth.js` — CLI `login()` function
- [x] Fix `--dodump`: add proactive dump after email step (before MFA detection)
- [x] Fix `--dodump`: add proactive dump when MFA screen is detected (step 1.5)
- [x] Fix `--dodump`: add proactive dump after password submission (step 2.5)
- [x] Add Number Matching detection in post-password race (step 2.5)
- [x] Extract number from `.displaySign` and print to terminal
- [x] Wait silently for page to auto-advance after phone approval

## `src/auth.js` — Electron `loginForElectron()` function
- [x] Fix `--dodump`: same proactive dumps as CLI version
- [x] Add Number Matching detection in post-password race (step 2.5)
- [x] Extract number and emit `sendEvent('mfa-number-match', { number })`
- [x] Wait silently for page to auto-advance (display popup hint on Electron side)
