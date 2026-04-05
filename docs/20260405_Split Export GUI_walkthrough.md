# Walkthrough - Split Export GUI

I have updated the application to separate the list-based export and URL-based export into their own dedicated sidebar items and views.

## Changes Made

### Electron Renderer

#### [index.html](electron/renderer/index.html)
- Updated the sidebar to include:
    - **Export from List** (📚 icon)
    - **Export from URL** (📕 icon)
- Updated the main view header with dynamic IDs for title and subtitle.
- **Removed the redundant "Select from List" / "Direct URL" tab buttons** entirely, as navigation is now fully handled by the sidebar.

#### [renderer.js](electron/renderer/renderer.js)
- Implemented `switchView('export-list')` and `switchView('export-url')`.
- Each view now dynamically sets:
    - The `exportMode` ('list' or 'link').
    - The page title and description.
    - Visibility of the notebook selector vs. URL input field.
- Added event listeners for the new sidebar items.
- Updated authentication logic to enable both buttons when logged in.
- **Cleaned up unused variables and listeners** related to the now-removed tab buttons.

## Verification

### Manual Verification Results
- **Sidebar**: The sidebar now correctly shows three items: Login, Export from List, and Export from URL.
- **Navigation**: Clicking each item correctly switches the view content and updates the header text.
- **Functionality**: 
    - "Export from List" correctly loads and displays the notebook selector.
    - "Export from URL" correctly displays the URL input field.
    - Both modes correctly update the `exportMode` state, ensuring the "Start Export" button triggers the intended behavior.
- **Auth State**: Both buttons are properly disabled when not logged in and enabled after successful login.
