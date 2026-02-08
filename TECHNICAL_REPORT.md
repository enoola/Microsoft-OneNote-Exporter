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

### 2. Attachment Downloads (Multi-Strategy approach)
**Challenge**: "Downloading" a PDF in OneNote Web often just opens a SharePoint viewer in a new tab, or requires complex user interactions like double-clicking and confirming a security warning.
**Solution**: A robust multi-strategy download manager implemented in `src/downloadStrategies.js`.
1.  **Strategy 1: Direct Download (URL Magic)**:
    - We intercept SharePoint/OneDrive URLs and automatically append `?download=1`.
    - We attempt a server-to-server stream fetch, bypassing the browser UI entirely for speed and reliability.
2.  **Strategy 2: Physical UI Click (with Modal Handling)**:
    - If direct download fails (or for local/printout files), we simulate a physical **double-click** in the browser.
    - We have built-in "Modal Intelligence": the script detects the OneNote "Download File" security prompt and automatically clicks the "Download" button to proceed.
3.  **Strategy 3: Event Racing**:
    - We race Playwright's `download` event against a `popup` event. If a new tab opens (e.g., a PDF viewer), we repeat the "Direct Download" logic on that new tab.
4.  **DOM Tagging**: To ensure interaction with the correct element, `scrapers.js` tags potential assets with unique IDs (`data-one-attach-id`) before the extraction loop begins.

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

### 5. Unified Wikilink Generation
**Challenge**: Different attachment types (Standard `<a>` links vs. `div` printouts) were being linked inconsistently, often losing their extensions or failing on filenames with special characters (parentheses, spaces).
**Solution**: A "Contract of Trust" between the `Exporter` and `Parser`.
- **The Exporter**: Determines the final unique filename on disk, then injects this **full filename** back into the HTML using `data-local-file` and `data-filename` attributes. It uses a robust escaped-ID regex to handle characters that would otherwise break JavaScript string replacements.
- **The Parser**: Has a "Smart Extension" rule. It trusts the `data-local-file` attribute if it already contains a dot (indicating a full filename), ensuring perfect Obsidian-style Wikilinks like `[[assets/filename.xlsx.pdf]]` are generated regardless of the source element type.

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

### Phase 5: Automation & Debugging
- [x] Non-interactive login automation (`--login`, `--password`)
- [x] Multi-point error detection (Username/Password/Redirection errors)
- [x] Comprehensive debug dumping (`--dodump`)
- [x] Landing page auto-traversal
- [x] Flexible success detection (URL + DOM indicators)
