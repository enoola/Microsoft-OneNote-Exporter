# Project Cleanup Walkthrough

I have added a convenient way to clean up generated and unnecessary files from your project.

## Changes Made

### 1. New NPM Script
I added a `clean` script to the [package.json](package.json) file.

```json
"clean": "rm -rf node_modules output .jest-cache .test-temp .tmp auth.json debug_*.html .DS_Store logs *.log dist build coverage"
```

## How to Clean Your Project

### Option 1: Using NPM (Recommended)
You can now run the following command in your terminal:

```bash
npm run clean
```

This will automatically remove:
- `node_modules/` (Dependencies - run `npm install` to restore)
- `output/` (Exported notebooks)
- `.jest-cache/`, `.test-temp/`, `.tmp/` (Caches and temporary files)
- [auth.json](auth.json) (Saved session)
- `debug_*.html` (Debug dumps)
- [.DS_Store](.DS_Store) (macOS internal files)
- `logs/` and `*.log` (Log files)
- `dist/`, `build/`, `coverage/` (Output and test coverage)

### Option 2: Manual Command
If you want to run the cleaning manually without using the script, you can use:

```bash
rm -rf node_modules output .jest-cache .test-temp .tmp auth.json debug_*.html .DS_Store
```

## Verification

I have verified the [package.json](package.json) modification. Here is the updated scripts section:

```json
    "scripts": {
        "start": "node src/index.js",
        "clean": "rm -rf node_modules output .jest-cache .test-temp .tmp auth.json debug_*.html .DS_Store",
        "test": "jest",
        "test:watch": "jest --watch"
    },
```

> [!TIP]
> After running the clean script, you will need to run `npm install` again to reinstall the project dependencies and `node src/index.js login` if you wish to re-authenticate.
