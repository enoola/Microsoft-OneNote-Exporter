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

const { downloadAttachment } = require('./downloadStrategies');

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
                            console.log(chalk.gray(`      [Asset] Saved IMAGE to: ${path.relative(process.cwd(), imgPath)}`));
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
                            console.log(chalk.gray(`      [Asset] Saved ATTACHMENT to: ${path.relative(process.cwd(), filePath)}`));
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
                            console.log(chalk.gray(`      [Asset] Saved VIDEO to: ${path.relative(process.cwd(), filePath)}`));
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
