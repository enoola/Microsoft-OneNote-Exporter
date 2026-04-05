const { Select } = require('enquirer');
const logger = require('./utils/logger');
const { listNotebooks, openNotebook, openNotebookByLink } = require('./navigator');
const { getSections, getPages, selectSection, selectPage, getPageContent, navigateBack, isSectionLocked } = require('./scrapers');
const { createMarkdownConverter } = require('./parser');
const { resolveInternalLinks } = require('./linkResolver');
const { withRetry } = require('./utils/retry');
const readline = require('readline');
const fs = require('fs-extra');
const path = require('path');
const sanitize = require('sanitize-filename');

const { downloadAttachment } = require('./downloadStrategies');

// Rename and generalize to downloadResource with retry logic
// options.timeout  - HTTP request timeout in ms (default 60 000)
// options.onError  - optional (msg) => void callback called on final failure
async function downloadResource(page, url, outputPath, options = {}) {
    const { timeout = 60000, onError } = options;
    return withRetry(async () => {
        if (url.startsWith('data:')) {
            const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                await fs.writeFile(outputPath, buffer);
                return true;
            }
            return false;
        }

        const response = await page.context().request.get(url, { timeout });
        if (response.ok()) {
            await fs.writeFile(outputPath, await response.body());
            return true;
        } else {
            throw new Error(`Failed to download resource (HTTP ${response.status()}): ${url.substring(0, 100)}...`);
        }
    }, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        operationName: `Download resource`,
        silent: true
    }).catch((e) => {
        const shortUrl = url.substring(0, 80) + '…';
        const msg = `Download failed (${e.message.split('\n')[0]}): ${shortUrl}`;
        logger.error(msg);
        if (onError) onError(msg);
        return false;
    });
}

function waitForEnter(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise((resolve) => {
        rl.question(message, () => {
            rl.close();
            resolve();
        });
    });
}

async function processSections(contentFrame, outputDir, td, options, pageIdMap, processedItems = new Set(), parentId = null, stats = { totalPages: 0, totalAssets: 0 }) {
    const sections = await getSections(contentFrame, parentId);
    if (sections.length === 0 && parentId) {
        logger.debug('(No items found in this group)');
    } else {
        logger.info(`Found ${sections.length} items at current level.`);
    }

    for (const item of sections) {
        if (processedItems.has(item.id)) continue;

        if (item.type === 'group') {
            const groupName = sanitize(item.name);
            const groupDir = path.join(outputDir, groupName);
            await fs.ensureDir(groupDir);

            // Map the Group ID to its directory for internal links
            pageIdMap[item.id] = { path: groupDir, isDir: true };
            processedItems.add(item.id);

            try {
                logger.info(`Entering group: ${item.name}`);
                await selectSection(contentFrame, item.id);
                // Extra wait for the tree to expand
                await contentFrame.waitForTimeout(5000);

                if (options.dodump) {
                    const logsDir = path.resolve(__dirname, '../logs');
                    await fs.ensureDir(logsDir);
                    const dumpPath = path.join(logsDir, `debug_group_${sanitize(item.name)}.html`);
                    await fs.writeFile(dumpPath, await contentFrame.content());
                }
                await processSections(contentFrame, groupDir, td, options, pageIdMap, processedItems, item.id, stats);
                logger.info(`Returning from group: ${item.name}`);
                await navigateBack(contentFrame);
                await contentFrame.waitForTimeout(3000);
            } catch (e) {
                logger.error(`Failed to process group ${item.name}:`, e);
            }
            continue;
        }

        // Processing regular Section
        try {
            await selectSection(contentFrame, item.id);
        } catch (e) {
            logger.error(`Failed to select section ${item.name}:`, e);
            continue;
        }

        await contentFrame.waitForTimeout(3000);

        // Check for password protection
        let isLocked = await isSectionLocked(contentFrame);

        // If locked, wait another 2s and re-check to avoid transition glitches from previous sections
        if (isLocked) {
            await contentFrame.waitForTimeout(2000);
            isLocked = await isSectionLocked(contentFrame);
        }

        const baseSectionName = sanitize(item.name);

        const isHeadless = !options.notheadless;
        if (isLocked && (options.nopassasked || isHeadless)) {
            if (isHeadless && !options.nopassasked) {
                logger.warn(`Section "${item.name}" is password protected.`);
                logger.warn(`The browser is running in headless mode, which means you cannot interact with it to unlock the section manually.`);
                logger.warn(`Acting as if --nopassasked was set: skipping this section.`);
            } else {
                logger.warn(`Section "${item.name}" appears password protected. Skipping as requested.`);
            }
            const protectedDir = path.join(outputDir, baseSectionName + " [passProtected]");
            await fs.ensureDir(protectedDir);
            processedItems.add(item.id);
            continue;
        }

        const sectionDir = path.join(outputDir, baseSectionName);
        await fs.ensureDir(sectionDir);

        // Map the Section ID to its directory for internal links
        pageIdMap[item.id] = { path: sectionDir, isDir: true };

        logger.step(`[Section] ${item.name}`);
        processedItems.add(item.id);

        while (isLocked) {
            logger.warn(`Section "${item.name}" is password protected.`);
            logger.info('Please switch to the browser window, unlock the section manually, and then return here.');
            await waitForEnter('Press ENTER here once the section is unlocked to continue...');

            // Re-verify
            await contentFrame.waitForTimeout(2000);
            isLocked = await isSectionLocked(contentFrame);
            if (isLocked) {
                logger.error('Section still appears to be locked. Please try again.');
            }
        }

        const pages = await getPages(contentFrame);
        logger.info(`Found ${pages.length} pages. Starting extraction...`);

        // Track used filenames in this section to handle collisions
        const usedNames = new Set();

        for (const pageInfo of pages) {
            // Deduplicate pages too
            if (processedItems.has(pageInfo.id)) continue;
            processedItems.add(pageInfo.id);

            logger.info(`Exporting: ${pageInfo.name} ...`);

            try {
                await selectPage(contentFrame, pageInfo.id);
                await contentFrame.waitForTimeout(3000);

                if (options.dodump) {
                    const logsDir = path.resolve(__dirname, '../logs');
                    await fs.ensureDir(logsDir);
                    const pageDumpPath = path.join(logsDir, `debug_page_${sanitize(pageInfo.name)}.html`);
                    await fs.writeFile(pageDumpPath, await contentFrame.content());
                }

                const content = await getPageContent(contentFrame);

                // Determine unique filename
                let baseName = sanitize(pageInfo.name || 'Untitled');
                let sanitizedNoteName = baseName;
                let collisionCount = 1;
                while (usedNames.has(sanitizedNoteName)) {
                    sanitizedNoteName = `${baseName}_${collisionCount++}`;
                }
                usedNames.add(sanitizedNoteName);
                const totalAssets = (content.images?.length || 0) +
                    (content.attachments?.length || 0) +
                    (content.videos?.length || 0);

                let updatedHtml = content.contentHtml || '';
                let assetCounter = 1;

                // Rename and Download Resources
                let savedResources = 0;
                const assetDir = path.join(sectionDir, 'assets');

                if (totalAssets > 0) {
                    await fs.ensureDir(assetDir);

                    // Helper to get unique filename in assets dir
                    const getUniqueAssetPath = (base, ext) => {
                        let name = sanitize(base);
                        let fullPath = path.join(assetDir, `${name}.${ext}`);
                        let counter = 1;
                        while (fs.existsSync(fullPath)) {
                            fullPath = path.join(assetDir, `${name}_${counter++}.${ext}`);
                        }
                        return fullPath;
                    };

                    // 1. Process Images (including Printouts)
                    for (const imgInfo of content.images || []) {
                        // For printouts, we might eventually want better names, but for now:
                        const finalBaseName = `${sanitizedNoteName}_img_${assetCounter++}`;
                        const imgPath = path.join(assetDir, `${finalBaseName}.png`);

                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-src="${imgInfo.id}"`, 'g'), `data-local-src="${finalBaseName}"`);

                        const success = await downloadResource(contentFrame.page(), imgInfo.src, imgPath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved IMAGE to: ${path.relative(process.cwd(), imgPath)}`);
                        }
                    }

                    // 2. Process Attachments
                    for (const attachInfo of content.attachments || []) {
                        let originalName = attachInfo.originalName || 'file';
                        let baseName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
                        let ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';

                        const filePath = getUniqueAssetPath(baseName, ext);
                        const finalFileName = path.basename(filePath);

                        // Tag it so Turndown knows the final filename
                        // We replace the ID with the actual FULL filename for the 'data-local-file' attribute
                        // This ensures parser.js can trust it directly if it contains a dot.
                        // We also capture and replace any existing data-filename attribute.
                        const escapedId = attachInfo.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        updatedHtml = updatedHtml.replace(
                            new RegExp(`data-local-file="${escapedId}"( data-filename="[^"]*")?`, 'g'),
                            `data-local-file="${finalFileName}" data-filename="${finalFileName}"`
                        );

                        const success = await downloadAttachment(contentFrame, attachInfo, filePath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved ATTACHMENT to: ${path.relative(process.cwd(), filePath)}`);
                        }
                    }

                    // 3. Process Videos
                    for (const videoInfo of content.videos || []) {
                        // Better extension detection for videos
                        let ext = 'mp4';
                        if (videoInfo.src) {
                            try {
                                const urlObj = new URL(videoInfo.src);
                                const pathname = urlObj.pathname;
                                const potentialExt = pathname.split('.').pop();
                                if (potentialExt && potentialExt.length < 5 && /^[a-z0-9]+$/i.test(potentialExt)) {
                                    ext = potentialExt;
                                }
                            } catch (e) {
                                // Fallback
                            }
                        }

                        const finalBaseName = `${sanitizedNoteName}_video_${assetCounter++}`;
                        const filePath = path.join(assetDir, `${finalBaseName}.${ext}`);

                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-video="${videoInfo.id}"`, 'g'), `data-local-video="${finalBaseName}"`);

                        const success = await downloadResource(contentFrame.page(), videoInfo.src, filePath);
                        if (success) {
                            savedResources++;
                            logger.debug(`[Asset] Saved VIDEO to: ${path.relative(process.cwd(), filePath)}`);
                        }
                    }
                }

                const markdown = td.turndown(updatedHtml);
                const fileName = sanitizedNoteName + '.md';
                const filePath = path.join(sectionDir, fileName);

                // Store page in map for cross-linking (relative to output base)
                pageIdMap[pageInfo.id] = {
                    path: filePath,
                    internalLinks: content.internalLinks,
                    isDir: false
                };

                const finalContent = `${content.dateTime}\n\n${markdown}`;

                await fs.writeFile(filePath, finalContent);
                stats.totalPages++;
                stats.totalAssets += savedResources;
                logger.success(`Saved (${savedResources} assets)`);

            } catch (e) {
                logger.error(`Failed to export ${pageInfo.name}:`, e);
            }
        }
    }
}

async function runExport(options = {}) {
    let session;

    try {
        // ── Fast path: --notebook-link skips the listing entirely ────────────
        if (options.notebookLink) {
            logger.info('Notebook link provided — skipping notebook listing.');
            session = await openNotebookByLink(options);

            const notebookName = session.notebookName || 'Notebook';
            logger.info(`Exporting notebook: ${notebookName}`);

            logger.info('Looking for OneNote content frame...');
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        logger.success(`Found content frame (navigation): ${f.url()}`);
                        if (options.dodump) {
                            const logsDir = path.resolve(__dirname, '../logs');
                            await fs.ensureDir(logsDir);
                            logger.warn('Dumping content frame HTML to logs/debug_notebook_content.html...');
                            const frameContent = await f.content();
                            await fs.writeFile(path.join(logsDir, 'debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {}
            }

            if (!contentFrame) {
                logger.warn('Could not auto-detect content frame. Using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, require('sanitize-filename')(notebookName));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            logger.info('Scanning sections...');
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                logger.warn('Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSections(contentFrame, outputBase, td, options, pageIdMap, new Set(), null, stats);

            logger.info('Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            logger.success('Export complete!');
            logger.info(`Total Pages: ${stats.totalPages}`);
            logger.info(`Total Assets: ${stats.totalAssets}`);
            logger.info(`Files saved in: ${outputBase}`);
            return;
        }
        // ────────────────────────────────────────────────────────────────────

        logger.info('Fetching notebooks...');
        session = await listNotebooks({ ...options, keepOpen: true });

        const { notebooks } = session;

        if (notebooks.length === 0) {
            logger.warn('No notebook have been found.');
            logger.warn('Remember: you can export a notebook by using the export command with the --notebook-link <url> option.');
            return;
        }

        let selectedNotebook;

        if (options.notebook) {
            logger.info(`Auto-selecting notebook: "${options.notebook}"...`);
            selectedNotebook = notebooks.find(nb => nb.name === options.notebook);

            if (!selectedNotebook) {
                throw new Error(`Notebook "${options.notebook}" not found in list. Available: ${notebooks.map(n => n.name).join(', ')}`);
            }
        } else {
            const prompt = new Select({
                name: 'notebook',
                message: 'Select a notebook to export:',
                choices: notebooks.map(nb => nb.name)
            });

            const answer = await prompt.run();
            selectedNotebook = notebooks.find(nb => nb.name === answer);
        }

        if (selectedNotebook) {
            logger.info(`You selected: ${selectedNotebook.name}`);
            await openNotebook(session.page, session.scrapeTarget, selectedNotebook.id);
            logger.success('Successfully entered notebook.');

            logger.info('Looking for OneNote content frame...');
            // Wait for frames to have time to load dynamic content
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;

            // Heuristic: Find frame with .sectionList or similar
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        logger.success(`Found content frame (navigation): ${f.url()}`);

                        if (options.dodump) {
                            const logsDir = path.resolve(__dirname, '../logs');
                            await fs.ensureDir(logsDir);
                            logger.warn('Dumping content frame HTML to logs/debug_notebook_content.html...');
                            const frameContent = await f.content();
                            await fs.writeFile(path.join(logsDir, 'debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {
                    // Ignore frames we can't access (CORS) or don't have the element
                }
            }

            if (!contentFrame) {
                logger.warn('Could not auto-detect content frame. using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, sanitize(selectedNotebook.name));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            logger.info('Scanning sections...');
            // Wait for section list specifically
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                logger.warn('Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            // Start recursive processing
            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSections(contentFrame, outputBase, td, options, pageIdMap, new Set(), null, stats);

            logger.info('Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            logger.success('Export complete!');
            logger.info(`Total Pages: ${stats.totalPages}`);
            logger.info(`Total Assets: ${stats.totalAssets}`);
            logger.info(`Files saved in: ${outputBase}`);
        }

    } catch (e) {
        logger.error('Export failed:', e);
    } finally {
        if (session && session.browser) {
            logger.debug('Closing browser...');
            await session.browser.close();
        }
    }
}

/**
 * Electron-aware export adapter.
 * Mirrors runExport() but sends all output via sendEvent(type, payload) callback.
 *
 * @param {object} options     - { notebook, notheadless, nopassasked }
 * @param {function} sendEvent - (type, payload) => void
 * @param {object} ipcMain     - electron ipcMain for section-lock round-trips
 */
async function runExportForElectron(options = {}, sendEvent, ipcMain) {
    const log = (level, message) => sendEvent('log', { level, message });
    // Download timeout in ms — user-configurable, default 60 s
    const downloadTimeout = options.downloadTimeout || 60000;
    // Shared onError callback that routes download failures to the GUI log
    const onDownloadError = (msg) => log('warn', `⚠ Asset skipped — ${msg}`);

    // ── Inline section processing adapted for Electron ──────────────────────
    async function processSectionsElectron(contentFrame, outputDir, td, pageIdMap, processedItems = new Set(), parentId = null, stats) {
        const sections = await getSections(contentFrame, parentId);
        if (sections.length === 0 && parentId) {
            log('debug', '(No items found in this group)');
        } else {
            log('info', `Found ${sections.length} items at current level.`);
        }

        for (const item of sections) {
            if (processedItems.has(item.id)) continue;

            if (item.type === 'group') {
                const groupName = sanitize(item.name);
                const groupDir = path.join(outputDir, groupName);
                await fs.ensureDir(groupDir);
                pageIdMap[item.id] = { path: groupDir, isDir: true };
                processedItems.add(item.id);
                try {
                    log('info', `Entering group: ${item.name}`);
                    await selectSection(contentFrame, item.id);
                    await contentFrame.waitForTimeout(5000);
                    if (options.dodump) {
                        const logsDir = path.resolve(__dirname, '../logs');
                        await fs.ensureDir(logsDir);
                        const dumpPath = path.join(logsDir, `debug_group_${sanitize(item.name)}.html`);
                        await fs.writeFile(dumpPath, await contentFrame.content());
                    }
                    await processSectionsElectron(contentFrame, groupDir, td, pageIdMap, processedItems, item.id, stats);
                    log('info', `Returning from group: ${item.name}`);
                    await navigateBack(contentFrame);
                    await contentFrame.waitForTimeout(3000);
                } catch (e) {
                    log('error', `Failed to process group ${item.name}: ${e.message}`);
                }
                continue;
            }

            // Regular Section
            try {
                await selectSection(contentFrame, item.id);
            } catch (e) {
                log('error', `Failed to select section ${item.name}: ${e.message}`);
                continue;
            }

            await contentFrame.waitForTimeout(3000);
            let isLocked = await isSectionLocked(contentFrame);
            if (isLocked) {
                await contentFrame.waitForTimeout(2000);
                isLocked = await isSectionLocked(contentFrame);
            }

            const baseSectionName = sanitize(item.name);
            const isHeadless = !options.notheadless;

            if (isLocked && (options.nopassasked || isHeadless)) {
                log('warn', `Section "${item.name}" is password protected — skipping.`);
                const protectedDir = path.join(outputDir, baseSectionName + ' [passProtected]');
                await fs.ensureDir(protectedDir);
                processedItems.add(item.id);
                continue;
            }

            const sectionDir = path.join(outputDir, baseSectionName);
            await fs.ensureDir(sectionDir);
            pageIdMap[item.id] = { path: sectionDir, isDir: true };
            log('step', `[Section] ${item.name}`);
            processedItems.add(item.id);

            // Section locked → ask user to unlock via GUI dialog
            while (isLocked) {
                log('warn', `Section "${item.name}" is password protected.`);
                sendEvent('section-locked', { sectionName: item.name });
                await new Promise((resolve) => {
                    ipcMain.once('section-unlocked', () => resolve());
                });
                await contentFrame.waitForTimeout(2000);
                isLocked = await isSectionLocked(contentFrame);
                if (isLocked) {
                    log('error', 'Section still appears to be locked. Please try again.');
                }
            }

            const pages = await getPages(contentFrame);
            log('info', `Found ${pages.length} pages. Starting extraction...`);
            const usedNames = new Set();

            for (const pageInfo of pages) {
                if (processedItems.has(pageInfo.id)) continue;
                processedItems.add(pageInfo.id);

                log('info', `Exporting: ${pageInfo.name} ...`);
                sendEvent('progress', { pageName: pageInfo.name, totalPages: stats.totalPages, totalAssets: stats.totalAssets });

                try {
                    await selectPage(contentFrame, pageInfo.id);
                    await contentFrame.waitForTimeout(3000);

                    if (options.dodump) {
                        const logsDir = path.resolve(__dirname, '../logs');
                        await fs.ensureDir(logsDir);
                        const pageDumpPath = path.join(logsDir, `debug_page_${sanitize(pageInfo.name)}.html`);
                        await fs.writeFile(pageDumpPath, await contentFrame.content());
                    }

                    const content = await getPageContent(contentFrame);
                    let baseName = sanitize(pageInfo.name || 'Untitled');
                    let sanitizedNoteName = baseName;
                    let collisionCount = 1;
                    while (usedNames.has(sanitizedNoteName)) {
                        sanitizedNoteName = `${baseName}_${collisionCount++}`;
                    }
                    usedNames.add(sanitizedNoteName);

                    const totalAssets = (content.images?.length || 0) + (content.attachments?.length || 0) + (content.videos?.length || 0);
                    let updatedHtml = content.contentHtml || '';
                    let assetCounter = 1;
                    let savedResources = 0;
                    const assetDir = path.join(sectionDir, 'assets');

                    if (totalAssets > 0) {
                        await fs.ensureDir(assetDir);
                        const getUniqueAssetPath = (base, ext) => {
                            let name = sanitize(base);
                            let fullPath = path.join(assetDir, `${name}.${ext}`);
                            let counter = 1;
                            while (fs.existsSync(fullPath)) {
                                fullPath = path.join(assetDir, `${name}_${counter++}.${ext}`);
                            }
                            return fullPath;
                        };

                        for (const imgInfo of content.images || []) {
                            const finalBaseName = `${sanitizedNoteName}_img_${assetCounter++}`;
                            const imgPath = path.join(assetDir, `${finalBaseName}.png`);
                            updatedHtml = updatedHtml.replace(new RegExp(`data-local-src="${imgInfo.id}"`, 'g'), `data-local-src="${finalBaseName}"`);
                            const success = await downloadResource(contentFrame.page(), imgInfo.src, imgPath, { timeout: downloadTimeout, onError: onDownloadError });
                            if (success) savedResources++;
                        }

                        for (const attachInfo of content.attachments || []) {
                            let originalName = attachInfo.originalName || 'file';
                            let bName = originalName.includes('.') ? originalName.substring(0, originalName.lastIndexOf('.')) : originalName;
                            let ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
                            const filePath = getUniqueAssetPath(bName, ext);
                            const finalFileName = path.basename(filePath);
                            const escapedId = attachInfo.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            updatedHtml = updatedHtml.replace(
                                new RegExp(`data-local-file="${escapedId}"( data-filename="[^"]*")?`, 'g'),
                                `data-local-file="${finalFileName}" data-filename="${finalFileName}"`
                            );
                            const success = await downloadAttachment(contentFrame, attachInfo, filePath);
                            if (success) savedResources++;
                        }

                        for (const videoInfo of content.videos || []) {
                            let ext = 'mp4';
                            if (videoInfo.src) {
                                try {
                                    const urlObj = new URL(videoInfo.src);
                                    const potentialExt = urlObj.pathname.split('.').pop();
                                    if (potentialExt && potentialExt.length < 5 && /^[a-z0-9]+$/i.test(potentialExt)) ext = potentialExt;
                                } catch (e) {}
                            }
                            const finalBaseName = `${sanitizedNoteName}_video_${assetCounter++}`;
                            const filePath = path.join(assetDir, `${finalBaseName}.${ext}`);
                            updatedHtml = updatedHtml.replace(new RegExp(`data-local-video="${videoInfo.id}"`, 'g'), `data-local-video="${finalBaseName}"`);
                            const success = await downloadResource(contentFrame.page(), videoInfo.src, filePath, { timeout: downloadTimeout, onError: onDownloadError });
                            if (success) savedResources++;
                        }
                    }

                    const markdown = td.turndown(updatedHtml);
                    const fileName = sanitizedNoteName + '.md';
                    const filePath = path.join(sectionDir, fileName);
                    pageIdMap[pageInfo.id] = { path: filePath, internalLinks: content.internalLinks, isDir: false };
                    const finalContent = `${content.dateTime}\n\n${markdown}`;
                    await fs.writeFile(filePath, finalContent);
                    stats.totalPages++;
                    stats.totalAssets += savedResources;
                    log('success', `Saved "${pageInfo.name}" (${savedResources} assets)`);
                    sendEvent('progress', { pageName: pageInfo.name, totalPages: stats.totalPages, totalAssets: stats.totalAssets });
                } catch (e) {
                    log('error', `Failed to export ${pageInfo.name}: ${e.message}`);
                }
            }
        }
    }
    // ────────────────────────────────────────────────────────────────────────

    let session;
    try {
        if (options.notebookLink) {
            log('info', 'Notebook link provided — skipping notebook listing.');
            session = await openNotebookByLink(options);
            const notebookName = session.notebookName || 'Notebook';
            log('info', `Exporting notebook: ${notebookName}`);

            log('info', 'Looking for OneNote content frame...');
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;
            for (const f of frames) {
                try {
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        log('success', `Found content frame: ${f.url()}`);

                        if (options.dodump) {
                            const logsDir = path.resolve(__dirname, '../logs');
                            await fs.ensureDir(logsDir);
                            log('warn', 'Dumping content frame HTML to logs/debug_notebook_content.html...');
                            const frameContent = await f.content();
                            await fs.writeFile(path.join(logsDir, 'debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {}
            }
            if (!contentFrame) {
                log('warn', 'Could not auto-detect content frame. Using main page as fallback...');
                contentFrame = session.page;
            }

            const baseDir = options.exportDir || path.resolve(__dirname, '../output');
            const outputBase = path.resolve(baseDir, sanitize(notebookName));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            log('info', 'Scanning sections...');
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                log('warn', 'Timeout waiting for .sectionList, trying to scrape anyway...');
            }

            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSectionsElectron(contentFrame, outputBase, td, pageIdMap, new Set(), null, stats);

            log('info', 'Resolving internal links...');
            await resolveInternalLinks(pageIdMap, outputBase);

            log('success', 'Export complete!');
            sendEvent('export-complete', { totalPages: stats.totalPages, totalAssets: stats.totalAssets, outputDir: outputBase });
            return { success: true, ...stats, outputDir: outputBase };
        }

        log('info', 'Fetching notebooks...');
        session = await listNotebooks({ ...options, keepOpen: true });
        const { notebooks } = session;

        if (notebooks.length === 0) {
            log('warn', 'No notebook have been found.');
            log('warn', 'Remember: you can export a notebook by using the export command with the --notebook-link <url> option.');
            return { success: false, error: 'No notebooks found.' };
        }

        let selectedNotebook;
        if (options.notebook) {
            log('info', `Auto-selecting notebook: "${options.notebook}"...`);
            selectedNotebook = notebooks.find(nb => nb.name === options.notebook);
            if (!selectedNotebook) {
                throw new Error(`Notebook "${options.notebook}" not found. Available: ${notebooks.map(n => n.name).join(', ')}`);
            }
        } else {
            throw new Error('No notebook specified. Pass options.notebook.');
        }

        log('info', `Exporting: ${selectedNotebook.name}`);
        await openNotebook(session.page, session.scrapeTarget, selectedNotebook.id);
        log('success', 'Successfully entered notebook.');

        log('info', 'Looking for OneNote content frame...');
        await session.page.waitForTimeout(10000);

        const frames = session.page.frames();
        let contentFrame = null;
        for (const f of frames) {
            try {
                const hasSections = await f.$('.sectionList');
                if (hasSections) {
                    contentFrame = f;
                    log('success', `Found content frame: ${f.url()}`);

                    if (options.dodump) {
                        const logsDir = path.resolve(__dirname, '../logs');
                        await fs.ensureDir(logsDir);
                        log('warn', 'Dumping content frame HTML to logs/debug_notebook_content.html...');
                        const frameContent = await f.content();
                        await fs.writeFile(path.join(logsDir, 'debug_notebook_content.html'), frameContent);
                    }
                    break;
                }
            } catch (e) {}
        }
        if (!contentFrame) {
            log('warn', 'Could not auto-detect content frame. Using main page as fallback...');
            contentFrame = session.page;
        }

        const baseDir = options.exportDir || path.resolve(__dirname, '../output');
        const outputBase = path.resolve(baseDir, sanitize(selectedNotebook.name));
        await fs.ensureDir(outputBase);
        const td = createMarkdownConverter();

        log('info', 'Scanning sections...');
        try {
            await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
        } catch (e) {
            log('warn', 'Timeout waiting for .sectionList, trying to scrape anyway...');
        }

        const pageIdMap = {};
        const stats = { totalPages: 0, totalAssets: 0 };
        await processSectionsElectron(contentFrame, outputBase, td, pageIdMap, new Set(), null, stats);

        log('info', 'Resolving internal links...');
        await resolveInternalLinks(pageIdMap, outputBase);

        log('success', 'Export complete!');
        sendEvent('export-complete', { totalPages: stats.totalPages, totalAssets: stats.totalAssets, outputDir: outputBase });
        return { success: true, ...stats, outputDir: outputBase };
    } catch (e) {
        log('error', `Export failed: ${e.message}`);
        sendEvent('export-error', { error: e.message });
        return { success: false, error: e.message };
    } finally {
        if (session && session.browser) {
            await session.browser.close();
        }
    }
}

module.exports = { runExport, runExportForElectron };
