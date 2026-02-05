# Installation Guide

This guide provides instructions on how to set up and run the OneNote to Obsidian Exporter on Mac, Windows, and Linux.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### 1. Node.js (LTS Version)
The project requires **Node.js 18.x or higher**.
- **Download**: [nodejs.org](https://nodejs.org/)
- **Check version**:
  ```bash
  node -v
  ```

### 2. npm (Node Package Manager)
npm is usually installed automatically with Node.js.
- **Check version**:
  ```bash
  npm -v
  ```

### 3. Git (Optional, but recommended)
Required to clone the repository.
- **Download**: [git-scm.com](https://git-scm.com/)

---

## Installation Steps

Follow these steps for all operating systems:

### 1. Clone the Repository
Open your terminal (Terminal on Mac/Linux, Command Prompt or PowerShell on Windows) and run:
```bash
git clone https://github.com/enoola/Microsoft-OneNote-Exporter.git
cd Microsoft-OneNote-Exporter
```
*(If you downloaded the ZIP file, extract it and navigate to the folder in your terminal.)*

### 2. Install Project Dependencies
Install the required Node.js libraries:
```bash
npm install
```

### 3. Install Playwright Browsers
The tool uses Playwright to automate the OneNote web interface. You need to install the browser binaries it requires:
```bash
npx playwright install chromium
```

---

## OS-Specific Dependencies

Playwright may require additional system-level libraries depending on your OS.

### macOS
Generally, no additional steps are needed if you have a modern macOS version. If you encounter issues, ensure you have the latest Command Line Tools:
```bash
xcode-select --install
```

### Windows
No additional steps are usually required. Ensure you are running your terminal with appropriate permissions if you encounter folder creation errors.

### Linux (Ubuntu/Debian)
You may need to install system dependencies for the browser:
```bash
# This installs all necessary libraries for Playwright browsers
npx playwright install-deps
```

---

## Verification

To verify that everything is installed correctly, try running the help command:
```bash
node src/index.js --help
```
If you see the list of available commands, you are ready to go! Refer to the [README.md](README.md) for usage instructions.
