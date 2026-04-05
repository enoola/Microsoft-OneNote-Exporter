# Implementation Plan - Split Export GUI into List and URL Views

The user wants to separate the "Export" functionality into two distinct sidebar items: "Export from List" and "Export from URL", replacing the current tab-based system within a single "Export" view.

## Proposed Changes

### [Electron Renderer Component](electron/renderer)

#### [MODIFY] [index.html](electron/renderer/index.html)
- Update the sidebar navigation:
    - Rename `#nav-export` to `#nav-export-list` and change text to "Export from List".
    - Add `#nav-export-url` with icon "📕" and text "Export from URL".
- Update the Main View (`#view-export`):
    - I will split this into two separate views `#view-export-list` and `#view-export-url` for maximum clarity.
    - Each view will have its own header, selection card, and common components (options, progress, log).

#### [MODIFY] [renderer.js](electron/renderer/renderer.js)
- Update DOM references for the new sidebar items and split views.
- Update `switchView(name)` to handle `'export-list'` and `'export-url'`.
- Duplicate or share logic for common elements like options, progress, and logs between the two views.
- Update `setAuthStatus` to enable/disable both export buttons based on login state.
- Trigger `loadNotebooks()` when switching to `'export-list'`.

#### [MODIFY] [styles.css](electron/renderer/styles.css)
- Add styles for the new sidebar icon (📕).

## Verification Plan

### Manual Verification
1. Launch the application: `npm run electron:dev`.
2. Check the sidebar: "Login", "Export from List", "Export from URL".
3. Verify they are disabled before login.
4. Log in and verify both become enabled.
5. Confirm clicking each shows the correct view and triggers the correct process (notebook loading for list mode).
