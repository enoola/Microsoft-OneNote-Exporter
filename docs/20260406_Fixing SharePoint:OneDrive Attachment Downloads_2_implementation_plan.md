# Implementation Plan: Office Online Manual Download Fallback

This plan enhances the `tryDirectDownload` strategy to handle cases where SharePoint/OneDrive links redirect to the Office Online viewer (Word/Excel/PowerPoint) instead of triggering a direct download.

## User Review Required

> [!IMPORTANT]
> The Office Online UI is dynamic and can be slow to initialize. This fallback adds a sequence of interactions ("File" -> "Save As / Create a Copy" -> "Download a Copy") to force the download. It will increase the maximum time spent per cloud attachment but significantly improve reliability.

## Proposed Changes

### Download Strategies

#### [MODIFY] [downloadStrategies.js](file:///Users/enola/Workspace//src/downloadStrategies.js)

1.  **Enhance `tryDirectDownload`**:
    -   Increase the `downloadPromise` timeout to allow for redirects.
    -   If a download isn't triggered within 15 seconds after `page.goto`, check for Office Online UI elements.
    -   Implement `handleOfficeOnlineDownload(tempPage)`:
        -   Wait for the "File" menu button.
        -   Click "File".
        -   Look for "Save As" or "Create a Copy" and click it.
        -   Wait for the "Download a Copy" option and click it.
        -   Wait for the `download` event and save the file.
2.  **Robust Locators**: Use Playwright's `getByRole` and `getByText` with regex patterns to handle variations like "Save As" vs "Create a Copy" and different language versions if possible (prioritizing English per user screenshot).

---

## Verification Plan

### Automated Tests
-   Run `node src/tmp/verify_fix.js` to ensure the core detection logic remains intact.

### Manual Verification
-   Run the full export with `--notheadless` and observe the behavior when an Excel Online page is opened.
-   Verify that the "File" menu is correctly navigated and the download completes.
-   Check the `output/` directory for the downloaded files.
