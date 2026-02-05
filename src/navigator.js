const { chromium } = require('playwright');
const chalk = require('chalk');
const { getAuthenticatedContext } = require('./auth');
const { ONENOTE_URL } = require('./config');
const fs = require('fs-extra');
const path = require('path');

async function listNotebooks(options = {}) {
    console.log(chalk.blue('Connecting to OneNote...'));

    // Default to true (headless) unless --notheadless is passed
    const headless = !options.notheadless;
    console.log(chalk.gray(`Debugging: Launching browser (headless: ${headless})...`));

    const browser = await chromium.launch({ headless });
    try {
        const context = await getAuthenticatedContext(browser);
        const page = await context.newPage();

        console.log(chalk.blue('Navigating to notebooks list...'));
        await page.goto(ONENOTE_URL);

        // Relaxed wait condition
        try {
            console.log(chalk.gray('Waiting for page content (domcontentloaded)...'));
            await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        } catch (e) {
            console.warn(chalk.yellow('Page load timeout/warning, proceeding to scrape anyway...'));
        }

        console.log(chalk.blue('Waiting 20 seconds for dynamic content to render...'));
        await page.waitForTimeout(20000);

        // Dump main page content if requested
        if (options.dodump) {
            console.log(chalk.yellow('Dumping main page content to debug_page_dump.html...'));
            const content = await page.content();
            await fs.writeFile(path.resolve(__dirname, '../debug_page_dump.html'), content);
        }

        // Try to locate the relevant iframe
        console.log(chalk.blue('Looking for "OneNote File Browser" iframe...'));
        const frameElement = await page.$('#FileBrowserIFrame');
        let frame = null;

        if (frameElement) {
            console.log(chalk.green('Found iframe element #FileBrowserIFrame, switching to it...'));
            frame = await frameElement.contentFrame();

            if (frame) {
                if (options.dodump) {
                    console.log(chalk.yellow('Dumping iframe content to debug_frame_dump.html...'));
                    const frameContent = await frame.content();
                    await fs.writeFile(path.resolve(__dirname, '../debug_frame_dump.html'), frameContent);
                }
            } else {
                console.error(chalk.red('Could not get contentFrame() from element.'));
            }
        } else {
            console.error(chalk.red('Could not find #FileBrowserIFrame in main page.'));
            // Fallback to main page if iframe not found
            frame = page;
        }

        let notebooks = [];
        const maxRetries = 10;

        // Use the identified frame (or page) for scraping
        const scrapeTarget = frame || page;

        for (let i = 0; i < maxRetries; i++) {
            console.log(chalk.gray(`Attempt ${i + 1}/${maxRetries} to find notebooks in frame...`));

            notebooks = await scrapeTarget.evaluate(() => {
                // FluentUI DetailsList selectors
                const rows = Array.from(document.querySelectorAll('div[role="row"]'));

                return rows
                    // Exclude header rows
                    .filter(r => r.getAttribute('data-automationid') !== 'row-header')
                    .map(row => {
                        // Look for the name cell
                        const nameCell = row.querySelector('[data-automationid="field-name"]');
                        if (!nameCell) return null;

                        // Look for the clickable button/link inside
                        const linkBtn = nameCell.querySelector('button[role="link"]');
                        if (!linkBtn) return null;

                        return {
                            name: linkBtn.innerText.trim(),
                            // There is no direct HREF in these SPA links. 
                            // We mark it as 'click-to-open' for future handling.
                            url: 'click-to-open',
                            id: row.getAttribute('data-automationid') // Capture ID for potential precise targeting
                        };
                    })
                    .filter(n => n && n.name);
            });

            if (notebooks.length > 0) {
                console.log(chalk.green(`Found ${notebooks.length} notebooks!`));
                break;
            }

            if (i < maxRetries - 1) {
                console.log(chalk.gray('No notebooks found yet, waiting 5 seconds...'));
                await page.waitForTimeout(5000);
            }
        }

        // Deduping
        const uniqueNotebooks = [];
        const seenIds = new Set();
        for (const nb of notebooks) {
            // Use ID for uniqueness if available, otherwise name
            const uniqueKey = nb.id || nb.name;
            if (!seenIds.has(uniqueKey)) {
                seenIds.add(uniqueKey);
                uniqueNotebooks.push(nb);
            }
        }

        if (options.keepOpen) {
            return { notebooks: uniqueNotebooks, browser, page, scrapeTarget };
        }
        return uniqueNotebooks;

    } catch (e) {
        console.error(chalk.red('Error listing notebooks:'), e);
        if (!options.keepOpen && browser) {
            await browser.close();
        }
        throw e;
    } finally {
        if (!options.keepOpen && browser) {
            await browser.close();
        }
    }
}

async function openNotebook(page, scrapeTarget, notebookId) {
    console.log(chalk.blue('Opening notebook...'));
    const selector = `div[data-automationid="${notebookId}"] button[role="link"]`;

    try {
        const btn = await scrapeTarget.$(selector);
        if (!btn) {
            throw new Error(`Could not find button for notebook ${notebookId}`);
        }

        console.log(chalk.gray('Clicking notebook link...'));
        await Promise.all([
            page.waitForLoadState('domcontentloaded'),
            btn.click()
        ]);

        console.log(chalk.green('Notebook opened!'));
        await page.waitForTimeout(5000);

    } catch (e) {
        console.error(chalk.red('Failed to open notebook'), e);
        throw e;
    }
}

module.exports = {
    listNotebooks,
    openNotebook
};
