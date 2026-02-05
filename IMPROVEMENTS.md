# Future Improvements

While the exporter is currently functional and robust, the following improvements could enhance performance, usability, and feature support.

## 1. Performance Optimizations
- **Parallel Scraping**: Currently, extraction is sequential (Section by Section). Browsing multiple sections in parallel tabs (context pages) could significantly speed up large exports.
- **Incremental Export**: Implement a state database (SQLite or simple JSON) to track `LastModified` timestamps of pages. Only export pages that have changed since the last run.

## 2. Content fidelity
- **OCR text embedding**: OneNote performs OCR on images. We could extract this `alt` text (often available in the DOM) and embed it as a comment or callout in Obsidian for searchability.
- **Tag Conversion**: Map OneNote tags (Checkboxes, Stars, Question marks) to Obsidian tags (`#tag`) or Callouts (`> [!info]`).
- **Mathematical Equations**: OneNote equations use a proprietary format. A converter to LaTeX (`$$...$$`) would be valuable for academic users.

## 3. User Experience
- **TUI (Text User Interface)**: Replace the standard console logs with a rich TUI (using `ink` or `blessed`) showing real-time progress bars for multiple sections simultaneously.
- **Config File**: Support a `.onenote-exportrc` file to save preferences (output directory, ignored sections, headless preferences) so CLI flags aren't always needed.

## 4. Architecture
- **Docker Support**: Containerize the application (including the browser requirements) to ensure it runs consistently on any machine, bypassing local environment permission issues (like the `mkdtemp` EPERM errors seen on Mac).
