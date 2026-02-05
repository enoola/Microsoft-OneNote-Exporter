# OneNote to Obsidian Exporter

A robust, automated tool to export Microsoft OneNote notebooks into Obsidian-compatible Markdown folders. This tool preserves your notebook's hierarchy, downloads all attachments (PDFs, images, videos), and correctly resolves internal links.

> [!IMPORTANT]
> **New to the project?** Follow the [Installation Guide](INSTALLATION.md) to set up your environment on Mac, Windows, or Linux.

## Features

- **Full Hierarchy Preservation**: Exports Notebooks → Section Groups → Sections → Pages.
- **Rich Content Extraction**:
  - Converts OneNote HTML to clean Markdown.
  - Downloads **PDFs, Word docs, and other attachments** locally.
  - Downloads **Images and Videos** and embeds them with Obsidian syntax.
- **Smart Link Resolution**:
  - Converts internal OneNote links (`onenote:`) to Obsidian Wikilinks (`[[path/to/note]]`).
  - Handles deep links to specific sections or nested pages.
  - specific "Fuzzy ID Matching" to handle OneNote's variable ID formats.
- **Robust File Naming**:
  - Automatically cleans filenames (e.g., removes "Page 1 of 2" suffixes).
  - Handles duplicate page names by appending counters (`Note_1.md`).
- **Security Handling**:
  - Detects password-protected sections.
  - Interactive "Pause & Unlock" mode.
  - Automated skip mode (`--nopassasked`) for hands-free backups.
- **Automation Ready**: Check/Login/Export commands with CLI flags for fully automated workflows.

## Installation

```bash
npm install
```

## Usage

### 1. Authentication
First, log in to your Microsoft Account. This launches a browser window for you to sign in.

```bash
node src/index.js login
```

### 2. Interactive Export
List available notebooks and select one to export.

```bash
node src/index.js export
```

### 3. Automated Export
Bypass the selection prompt by specifying the notebook name directly.

```bash
# Export specific notebook
node src/index.js export --notebook "My Notebook Name"

# Export completely hands-free (skip password protected sections)
node src/index.js export --notebook "My Notebook Name" --nopassasked
```

### 4. Debugging
If you encounter issues, you can run in visible mode or dump DOM snapshots.

```bash
# Run with a visible browser window (useful for debugging or manual login)
node src/index.js export --notheadless

# Dump HTML files for debugging
node src/index.js export --dodump
```

> [!WARNING]
> The `--dodump` option saves the HTML content of every page and frame encountered to disk. For large notebooks, this can consume a significant amount of disk space and create thousands of files. Use it only for troubleshooting specific issues.

## Cumulative Example
You can combine all options for a fully automated, visible, and documented run:

```bash
node src/index.js export --notebook "My Notebook Name" --nopassasked --notheadless --dodump
```

## Output Structure

The tool creates an `output` directory:

```
output/
  └── Notebook Name/
      ├── Section Group/
      │   ├── Section A/
      │   │   ├── Page 1.md
      │   │   ├── Page 1_1.md (Duplicate handling)
      │   │   └── assets/
      │   │       ├── Page 1.pdf
      │   │       └── Page 1.png
      │   └── Subsection/
      │       └── Page 2.md
      └── Section B/
          └── ...
```
