const { Select } = require('enquirer');
const chalk = require('chalk');
const { listNotebooks, openNotebook } = require('./navigator');
const { getSections, getPages, selectSection, selectPage, getPageContent, navigateBack, isSectionLocked } = require('./scrapers');
const { createMarkdownConverter } = require('./parser');
const { resolveInternalLinks } = require('./linkResolver');
const { withRetry } = require('./utils/retry');
const readline = require('readline');
const fs = require('fs-extra');
const path = require('path');
const sanitize = require('sanitize-filename');



// Specialized download for attachments that might need clicking (SharePoint/OneDrive) with retry
async function downloadAttachment(contentFrame, info, outputPath) {
    return withRetry(async () => {
        const page = contentFrame.page();
        const context = page.context();
        let url = info.src;

        // 1. Try URL transformation for SharePoint/OneDrive/1drv.ms
        // These often have a "viewer" page, but adding download=1 forces the file stream.
        if (url.includes('sharepoint.com') || url.includes('onedrive.live.com') || url.includes('1drv.ms')) {
            const separator = url.includes('?') ? '&' : '?';
            const downloadUrl = url + separator + 'download=1';

            try {
                const response = await context.request.get(downloadUrl);
                const contentType = response.headers()['content-type'] || '';

                // Allow almost any content type for attachments, but exclude HTML (pages/errors)
                if (response.ok() && !contentType.includes('text/html')) {
                    await fs.writeFile(outputPath, await response.body());
                    return true;
                }
            } catch (e) {
                // Ignore transformation error, fall back to clicking
            }
        }

        // 2. Try physical download by clicking
        const selector = `a[data-one-attach-id="${info.id}"]`;
        await contentFrame.waitForSelector(selector, { state: 'attached', timeout: 5000 }).catch(() => null);
        const linkExists = await contentFrame.$(selector);

        if (linkExists) {
            // Listen for BOTH download and popup (if it opens in a new tab)
            const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
            const popupPromise = page.waitForEvent('popup', { timeout: 15000 });

            const clickPromise = linkExists.click({ force: true });

            // Race the events
            const result = await Promise.race([
                downloadPromise.then(d => ({ type: 'download', value: d })),
                popupPromise.then(p => ({ type: 'popup', value: p })),
                clickPromise.then(() => new Promise(r => setTimeout(() => r({ type: 'timeout' }), 5000)))
            ]);

            if (result.type === 'download') {
                await result.value.saveAs(outputPath);
                return true;
            } else if (result.type === 'popup') {
                const popup = result.value;
                const popupUrl = popup.url();
                // If the popup opened a viewer, try forcing download there
                if (popupUrl.includes('sharepoint.com') || popupUrl.includes('onedrive.live.com')) {
                    const separator = popupUrl.includes('?') ? '&' : '?';
                    await popup.goto(popupUrl + separator + 'download=1').catch(() => null);
                    // The goto might trigger a download
                    try {
                        const d = await page.waitForEvent('download', { timeout: 10000 });
                        await d.saveAs(outputPath);
                        await popup.close();
                        return true;
                    } catch (e) { }
                }
                await popup.close();
            }
        }

        // Fallback: Use direct GET request on the original URL (last resort)
        const fallbackResult = await downloadResource(contentFrame.page(), info.src, outputPath);
        if (!fallbackResult) {
            throw new Error(`All download strategies failed for ${info.originalName}`);
        }
        return fallbackResult;
    }, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        operationName: `Download attachment ${info.originalName}`,
        silent: true
    }).catch((e) => {
        console.error(`      Error in downloadAttachment for ${info.originalName}: ${e.message}`);
        return false;
    });
}

// Rename and generalize to downloadResource with retry logic
async function downloadResource(page, url, outputPath) {
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

        const response = await page.context().request.get(url);
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
        console.error(`      Error downloading resource ${url.substring(0, 100)}...: ${e.message}`);
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
        console.log(chalk.gray(`  (No items found in this group)`));
    } else {
        console.log(chalk.white(`Found ${sections.length} items at current level.`));
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
                console.log(chalk.gray(`  Entering group: ${item.name}`));
                await selectSection(contentFrame, item.id);
                // Extra wait for the tree to expand
                await contentFrame.waitForTimeout(5000);

                if (options.dodump) {
                    const dumpPath = path.resolve(__dirname, `../debug_group_${sanitize(item.name)}.html`);
                    await fs.writeFile(dumpPath, await contentFrame.content());
                }
                await processSections(contentFrame, groupDir, td, options, pageIdMap, processedItems, item.id, stats);
                console.log(chalk.gray(`  Returning from group: ${item.name}`));
                await navigateBack(contentFrame);
                await contentFrame.waitForTimeout(3000);
            } catch (e) {
                console.error(chalk.red(`  Failed to process group ${item.name}: ${e.message}`));
            }
            continue;
        }

        // Processing regular Section
        try {
            await selectSection(contentFrame, item.id);
        } catch (e) {
            console.error(chalk.red(`Failed to select section ${item.name}: ${e.message}`));
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

        if (isLocked && options.nopassasked) {
            console.log(chalk.yellow(`  Section "${item.name}" appears password protected. Skipping as requested.`));
            const protectedDir = path.join(outputDir, baseSectionName + " [passProtected]");
            await fs.ensureDir(protectedDir);
            processedItems.add(item.id);
            continue;
        }

        const sectionDir = path.join(outputDir, baseSectionName);
        await fs.ensureDir(sectionDir);

        // Map the Section ID to its directory for internal links
        pageIdMap[item.id] = { path: sectionDir, isDir: true };

        console.log(chalk.bold.magenta(`\n[Section] ${item.name}`));
        processedItems.add(item.id);

        while (isLocked) {
            console.log(chalk.bold.yellow(`\n[WAIT] Section "${item.name}" is password protected.`));
            console.log(chalk.cyan(`Please switch to the browser window, unlock the section manually, and then return here.`));
            await waitForEnter(chalk.bold.white('Press ENTER here once the section is unlocked to continue...'));

            // Re-verify
            await contentFrame.waitForTimeout(2000);
            isLocked = await isSectionLocked(contentFrame);
            if (isLocked) {
                console.log(chalk.red('Section still appears to be locked. Please try again.'));
            }
        }

        const pages = await getPages(contentFrame);
        console.log(chalk.gray(`  Found ${pages.length} pages. Starting extraction...`));

        // Track used filenames in this section to handle collisions
        const usedNames = new Set();

        for (const pageInfo of pages) {
            // Deduplicate pages too
            if (processedItems.has(pageInfo.id)) continue;
            processedItems.add(pageInfo.id);

            process.stdout.write(chalk.white(`  - Exporting: ${pageInfo.name} ... `));

            try {
                await selectPage(contentFrame, pageInfo.id);
                await contentFrame.waitForTimeout(3000);

                if (options.dodump) {
                    const pageDumpPath = path.resolve(__dirname, `../debug_page_${sanitize(pageInfo.name)}.html`);
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

                    // 1. Process Images
                    for (const imgInfo of content.images || []) {
                        const finalBaseName = totalAssets > 1 ? `${sanitizedNoteName}_${assetCounter++}` : sanitizedNoteName;
                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-src="${imgInfo.id}"`, 'g'), `data-local-src="${finalBaseName}"`);
                        const imgPath = path.join(assetDir, `${finalBaseName}.png`);
                        const success = await downloadResource(contentFrame.page(), imgInfo.src, imgPath);
                        if (success) savedResources++;
                    }

                    // 2. Process Attachments
                    for (const attachInfo of content.attachments || []) {
                        const finalBaseName = totalAssets > 1 ? `${sanitizedNoteName}_${assetCounter++}` : sanitizedNoteName;
                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-file="${attachInfo.id}"`, 'g'), `data-local-file="${finalBaseName}"`);
                        const ext = attachInfo.originalName.includes('.') ? attachInfo.originalName.split('.').pop() : 'bin';
                        const filePath = path.join(assetDir, `${finalBaseName}.${ext}`);
                        const success = await downloadAttachment(contentFrame, attachInfo, filePath);
                        if (success) savedResources++;
                    }

                    // 3. Process Videos
                    for (const videoInfo of content.videos || []) {
                        const finalBaseName = totalAssets > 1 ? `${sanitizedNoteName}_${assetCounter++}` : sanitizedNoteName;
                        updatedHtml = updatedHtml.replace(new RegExp(`data-local-video="${videoInfo.id}"`, 'g'), `data-local-video="${finalBaseName}"`);
                        // Use .mp4 as default if unknown
                        const ext = videoInfo.src.split('.').pop().split('?')[0] || 'mp4';
                        const filePath = path.join(assetDir, `${finalBaseName}.${ext.length < 5 ? ext : 'mp4'}`);
                        const success = await downloadResource(contentFrame.page(), videoInfo.src, filePath);
                        if (success) savedResources++;
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
                process.stdout.write(chalk.green(`Saved (${savedResources} assets)\n`));

            } catch (e) {
                process.stdout.write(chalk.red(`Failed: ${e.message}\n`));
            }
        }
    }
}

async function runExport(options = {}) {
    let browser, session;

    try {
        console.log(chalk.blue('Fetching notebooks...'));
        session = await listNotebooks({ ...options, keepOpen: true, notheadless: true });

        const { notebooks } = session;

        if (notebooks.length === 0) {
            console.log(chalk.yellow('No notebooks found. Exiting.'));
            return;
        }

        let selectedNotebook;

        if (options.notebook) {
            console.log(chalk.blue(`Auto-selecting notebook: "${options.notebook}"...`));
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
            console.log(chalk.cyan(`You selected: ${selectedNotebook.name}`));
            await openNotebook(session.page, session.scrapeTarget, selectedNotebook.id);
            console.log(chalk.green('Successfully entered notebook.'));

            // Dump info was here, now replacing with Hierarchy Scan

            console.log(chalk.blue('Looking for OneNote content frame...'));
            // Wait for frames to have time to load dynamic content
            await session.page.waitForTimeout(10000);

            const frames = session.page.frames();
            let contentFrame = null;

            // Heuristic: Find frame with .sectionList or similar
            // In the dump, it was frame_1, which is a cross-origin iframe.
            for (const f of frames) {
                try {
                    // We check for a known element from our dump analysis
                    // .sectionList is a good candidate for the navigation pane
                    const hasSections = await f.$('.sectionList');
                    if (hasSections) {
                        contentFrame = f;
                        console.log(chalk.green(`Found content frame (navigation): ${f.url()}`));

                        if (options.dodump) {
                            console.log(chalk.yellow('Dumping content frame HTML to debug_notebook_content.html...'));
                            const frameContent = await f.content();
                            await fs.writeFile(path.resolve(__dirname, '../debug_notebook_content.html'), frameContent);
                        }
                        break;
                    }
                } catch (e) {
                    // Ignore frames we can't access (CORS) or don't have the element
                }
            }

            if (!contentFrame) {
                console.log(chalk.yellow('Could not auto-detect content frame. using main page as fallback...'));
                contentFrame = session.page;
            }

            const outputBase = path.resolve(__dirname, '../output', sanitize(selectedNotebook.name));
            await fs.ensureDir(outputBase);
            const td = createMarkdownConverter();

            console.log(chalk.blue('Scanning sections...'));
            // Wait for section list specifically
            try {
                await contentFrame.waitForSelector('.sectionList', { timeout: 10000 });
            } catch (e) {
                console.log(chalk.yellow('Timeout waiting for .sectionList, trying to scrape anyway...'));
            }

            // Start recursive processing
            const pageIdMap = {};
            const stats = { totalPages: 0, totalAssets: 0 };
            await processSections(contentFrame, outputBase, td, options, pageIdMap, new Set(), null, stats);

            console.log(chalk.blue('\nResolving internal links...'));
            await resolveInternalLinks(pageIdMap, outputBase);

            console.log(chalk.bold.green('\nExport complete!'));
            console.log(chalk.white(`Total Pages: ${stats.totalPages}`));
            console.log(chalk.white(`Total Assets: ${stats.totalAssets}`));
            console.log(chalk.cyan(`Files saved in: ${outputBase}`));
        }

    } catch (e) {
        console.error(chalk.red('Export failed:'), e);
    } finally {
        if (session && session.browser) {
            console.log(chalk.gray('Closing browser...'));
            await session.browser.close();
        }
    }
}

module.exports = { runExport };
