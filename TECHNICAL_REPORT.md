# Technical Retrospective & Architecture

This document details the technical implementation, challenges encountered, and solutions devised during the development of the OneNote to Obsidian Exporter.

## Architecture Overview

The tool is built on **Node.js** and relies on three core pillars:

1.  **Playwright (Automation/Scraping)**:
    - Chosen over the Graph API because the API does not reliably return all page content (specifically ink, certain attachment types, and legacy formatting).
    - Simulates a real user session to "see" what the user sees.
2.  **Turndown (HTML to Markdown)**:
    - Heavily customized with plugins and rules to handle OneNote's quirky DOM structure (tables, nested outlines, strange spacing).
3.  **Proprietary Link Resolver**:
    - A post-processing pass that maps internal OneNote locations to the generated file structure.

## Technical Challenges & Solutions

### 1. Deep Link Resolution (The "Fuzzy ID" Problem)
**Challenge**: Internal links in OneNote point to identifiers like `UUID`. However, the DOM elements for those pages often have IDs like `{UUID}{1}` or `{UUID}{B0}`. Exact string matching failed, breaking links between pages.
**Solution**: Implemented a "Fuzzy ID Matcher".
- We build a `pageIdMap` of all exported content.
- During link resolution, if an exact match fails, we normalize the map keys by stripping braces `{}` and suffixes.
- If the normalized ID is found within the link's `href`, we consider it a match.

### 2. Attachment Downloads (SharePoint Redirection)
**Challenge**: "Downloading" a PDF in OneNote Web often just opens a SharePoint viewer in a new tab, rather than downloading the file.
**Solution**: A multi-strategy download manager (`downloadAttachment` in `exporter.js`).
1.  **Event Racing**: We trigger the click and race a `page.waitForEvent('download')` against a `page.waitForEvent('popup')`.
2.  **Redirection Handling**: If a popup opens (SharePoint viewer), we intercept the URL, append `?download=1`, and force a raw fetch of the stream.
3.  **DOM Tagging**: To ensure we click the *exact* right icon, we tag elements for extraction with unique IDs (`data-one-attach-id`) in the scraper context before trying to interact with them.

### 3. Password Protected Sections
**Challenge**: The scraper would hang or crash when encountering a locked section.
**Solution**:
- **Detection**: A dedicated `isSectionLocked` check scans for specific "Section Password Protected" text *and* verifies the element is visible (preventing false positives from hidden DOM elements).
- **Flow Control**: Implemented a "Pause/Resume" loop in the CLI. The script yields control to the user to unlock the section in the browser, then resumes.

### 4. Dirty Page Names
**Challenge**: Extracted page names often included accessibility artifacts, e.g., "My Note, Page 1 of 2. Selected. Press Ctrl...".
**Solution**: A two-stage Regex cleaner in `scrapers.js`:
1.  Strip the accessibility suffix (everything matching `, Page.*Select.*`).
2.  Strip the pagination suffix (`Page \d+ of \d+`).

## Task History

### Phase 1: Foundation
- [x] Project Setup & Dependencies
- [x] Authentication Module (Login flow)
- [x] Navigation (Notebook -> Section -> Page traversal)

### Phase 2: Content Extraction
- [x] Base HTML -> Markdown conversion
- [x] Asset extraction (Images/Videos)
- [x] Attachment downloading (PDFs/Office docs)

### Phase 3: Robustness
- [x] Error Handling (EISDIR fix for directories)
- [x] Link Resolution (Cross-notebook & Deep linking)
- [x] Password Protection handling
- [x] Filename collision strategy (`_N` suffix)

### Phase 4: UX & Polish
- [x] CLI Progress bars & Stats
- [x] Notebook Pre-selection (`--notebook`)
- [x] Headless mode configuration
