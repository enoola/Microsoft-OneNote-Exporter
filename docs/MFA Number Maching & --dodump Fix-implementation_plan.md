# MFA Number Matching & `--dodump` Fix

## Background

The login flow in `src/auth.js` needs two improvements:

1. **`--dodump` is not producing dumps** — dumps are buried in `catch` blocks only triggered by errors. Key diagnostic states (e.g. the MFA detection step) are never dumped even though the flag is passed.
2. **New MFA scenario (Number Matching)** — When logging in to corporate accounts (e.g. `@msbs.fr`), Microsoft may show an "Approve sign in request" screen with a 2-digit number (see screenshot). The user must open Microsoft Authenticator on their phone, enter that number, then tap OK. The browser page then automatically advances — **no further browser interaction is needed**.

The goal is to handle this headlessly: detect the screen, extract and display the number in the terminal, then wait (silently) for the phone approval to complete and the page to advance.

---

## Proposed Changes

### `src/auth.js`

This is the only file requiring changes, affecting both the `login()` (CLI) and `loginForElectron()` (GUI) functions.

---

#### Fix 1: `--dodump` proactive dumps

Currently dumps only occur inside `catch` blocks after errors. The fix adds **proactive diagnostic snapshots** at key decision points when `credentials.dodump` is truthy:

- After email submission (before MFA detection)
- When MFA / intermediate screens are detected
- After password submission (before post-password MFA check)
- At any post-password MFA screen

This makes `--dodump` actually useful for diagnosing what screen the automation sees.

---

#### Fix 2: Number Matching MFA detection (CLI `login()`)

After password submission (step 2.5), extend the `verificationScreen` race to also detect the Number Matching screen. New selectors:

| Selector | Purpose |
|---|---|
| `text=/Approve sign in request/i` | The heading on the number-match screen |
| `text=/Enter the number shown/i` | Subtitle text on the same screen |
| `.displaySign` | The `<div>` Microsoft uses to show the 2-digit number (confirmed in HTML) |

**Detection → action flow:**

```
POST PASSWORD SUBMIT
        │
        ├─ "Verify your identity" / "Enter code" / input[name="otc"]
        │        └─► Prompt user for OTC code (existing behavior)
        │
        └─ "Approve sign in request" / displaySign element found
                 └─► Extract number from .displaySign
                     └─► Print to terminal: "ACTION REQUIRED: Open Microsoft Authenticator and enter: 47"
                         └─► Wait up to 120s for page to auto-navigate away (phone approval)
                             └─► If page advances → continue to "Stay signed in?" prompt
                                 └─► If timeout → throw error
```

**Key implementation notes:**
- The number is extracted with: `page.$eval('.displaySign', el => el.textContent.trim())`
- After extraction we do **NOT** fill any input or click any button. We simply `waitForURL` or wait for the MFA page to disappear (the Authenticator app approval triggers the server-side redirect).
- Wait strategy: `Promise.race([page.waitForURL(...not login page...), page.waitForSelector('.displaySign', {state: 'hidden'})])` with a 120s timeout.

---

#### Fix 3: Number Matching MFA detection (Electron `loginForElectron()`)

Same logic as Fix 2 but uses `sendEvent` instead of `console.log`:

- `sendEvent('mfa-number-match', { number: '47' })` — tells the renderer to display the number to the user
- Then waits for the page to auto-advance (same race as above — no IPC round-trip needed from phone approval)

---

## Verification Plan

### Manual verification (automated login with `--dodump`)
```bash
node src/index.js login --login <email> --password <password> --dodump
```
- Confirm HTML dumps are created at each step regardless of success/failure

### Manual verification (MFA Number Matching)
```bash
node src/index.js login --login <email> --password <password>
```
- Confirm the number appears in the terminal
- Open Microsoft Authenticator, enter the number, tap OK
- Confirm the session is saved to `auth.json`

### Regression check
```bash
node src/index.js login --login <email> --password <password>
```
- Verify non-MFA corporate accounts still authenticate (no number-match screen → falls through cleanly)
