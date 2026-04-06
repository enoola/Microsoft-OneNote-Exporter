# Fix Attachment Download for SharePoint/OneDrive Links

## Problem
The `Microsoft-OneNote-Exporter` fails to detect and download certain Excel and Office attachments when they are hosted on SharePoint or OneDrive. This is because the scraper's detection logic is too restrictive and doesn't account for common Office-on-the-web URL patterns.

## User Review Required
> [!IMPORTANT]
> The fix involves broadening the detection of what is considered a "file" on a OneNote page. This might result in some regular links being treated as attachments if they look like SharePoint documents.

## Proposed Changes

### [Scraper Component]

#### [MODIFY] [scrapers.js](file:///Users/enola/Workspace//src/scrapers.js)
- Update `isFileLink` function:
    - Add detection for Office app markers in URLs: `:x:` (Excel), `:w:` (Word), `:p:` (PowerPoint).
    - Recognize `Doc.aspx` and `Doc2.aspx` as document endpoints.
    - Improve regex to find extensions anywhere in the URL (e.g., handles `file.xlsx?web=1`).
    - Explicitly include links containing `sharepoint.com` or `1drv.ms` that point to Office documents even without specific CSS classes.
- Update `attachmentInfos` extraction:
    - Better extract original filenames from SharePoint `file=` or `sourcedoc=` parameters.

---

### [Parser Component]

#### [MODIFY] [parser.js](file:///Users/enola/Workspace//src/parser.js)
- Ensure the `localFiles` rule remains robust for these newly detected cloud attachments.

## Verification Plan

### Automated Tests
- Create a standalone test script `/tmp/verify_fix.js` that mocks various problematic URLs and validates that `isFileLink` correctly identifies them as files.
- Run the script with `node /tmp/verify_fix.js`.

### Manual Verification
- Re-run the export for the problematic notebook:
  ```bash
  node src/index.js export --notheadless --dodump --notebook-link 'https://distributionelectricite-my.sharepoint.com/:o:/r/personal/john_pigeret_enedis_fr/Documents/Complete%20yet%20Small%20Test%20Notebook?d=w1a02e8536e3b45a5a0ab661c7306f05c&csf=1&web=1&e=oVPj2z'
  ```
- Verify that the `output/` directory now contains the `assets/` folder with the Excel files.
