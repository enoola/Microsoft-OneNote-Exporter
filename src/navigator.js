const { chromium } = require('playwright');
const logger = require('./utils/logger');
const { getAuthenticatedContext } = require('./auth');
const { ONENOTE_URL } = require('./config');
const fs = require('fs-extra');
const path = require('path');

/**
 * Detects the Microsoft Defender / MCAS "Use Edge Browser" interstitial
 * (URL pattern: *.access.mcas.ms/aad_login) and dismisses it by:
 *  1. Checking "Hide this notification for all apps for one week"
 *  2. Clicking "Continue in current browser"
 *
 * Safe to call even when the page is NOT the MCAS interstitial — it will
 * simply return false immediately.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<boolean>} true if the interstitial was detected and dismissed
 */
async function dismissMcasInterstitial(page) {
    const url = page.url();
    if (!url.includes('access.mcas.ms')) {
        return false;
    }

    logger.warn('Detected Microsoft Defender MCAS interstitial — dismissing...');

    try {
        // Wait for the MCAS form to be fully rendered (up to 10 s)
        await page.waitForSelector('#skip-disclaimer-checkbox', { timeout: 10000 }).catch(() => {});

        // Check the "Hide this notification for all apps for one week" checkbox
        // Actual element: <input type="checkbox" id="skip-disclaimer-checkbox">
        const checkbox = await page.$('#skip-disclaimer-checkbox');
        if (checkbox) {
            const isChecked = await checkbox.isChecked();
            if (!isChecked) {
                await checkbox.check();
                logger.debug('MCAS: checked "Hide this notification for all apps for one week".');
            }
        } else {
            logger.warn('MCAS: could not find the "Hide" checkbox.');
        }

        // Click "Continue in current browser"
        // Actual element: <input type="submit" id="hiddenformSubmitBtn" value="Continue in current browser">
        // (NOT an <a> tag — it is a submit button inside a form)
        const continueBtn = await page.$('#hiddenformSubmitBtn');
        if (continueBtn) {
            logger.debug('MCAS: clicking "Continue in current browser"...');
            await Promise.all([
                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
                continueBtn.click()
            ]);
            logger.success('MCAS interstitial dismissed.');

            // Wait for page to fully settle after the redirect
            try {
                await page.waitForLoadState('networkidle', { timeout: 45000 });
            } catch (e) {
                logger.warn('MCAS post-dismiss network idle timeout — continuing anyway...');
            }
            return true;
        } else {
            logger.warn('MCAS: could not find "Continue in current browser" submit button.');
        }
    } catch (e) {
        logger.warn(`MCAS interstitial dismissal failed: ${e.message}`);
    }

    return false;
}

async function listNotebooks(options = {}) {
    logger.info('Connecting to OneNote...');

    // Default to true (headless) unless --notheadless is passed
    const headless = !options.notheadless;
    logger.debug(`Launching browser (headless: ${headless})...`);

    const browser = await chromium.launch({ headless });
    try {
        const context = await getAuthenticatedContext(browser);
        const page = await context.newPage();

        logger.info('Navigating to notebooks list...');
        await page.goto(ONENOTE_URL);

        // Wait for initial DOM content
        try {
            logger.debug('Waiting for page content (domcontentloaded)...');
            await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        } catch (e) {
            logger.warn('Page load timeout/warning, proceeding to scrape anyway...');
        }

        // Wait for all in-flight redirects to settle (Microsoft auth chain can do 3-4 hops).
        // networkidle waits until there are no network requests for 500ms.
        logger.info('Waiting for page to fully settle after redirects...');
        try {
            await page.waitForLoadState('networkidle', { timeout: 45000 });
        } catch (e) {
            logger.warn('Network idle timeout — continuing anyway...');
        }

        // Dismiss MCAS "Use Edge Browser" interstitial if present
        await dismissMcasInterstitial(page);

        // Extra grace period for SPA JS rendering
        logger.info('Will wait 5 seconds to let the document load properly');
        await page.waitForTimeout(5000);

        // Dump main page content if requested
        if (options.dodump) {
            const dumpDir = await logger.getDumpDir();
            const displayPath = logger.getDumpDisplayPath();
            logger.warn(`Dumping main page content to ${displayPath}/debug_page_dump.html...`);
            const content = await page.content();
            await fs.writeFile(path.join(dumpDir, 'debug_page_dump.html'), content);
        }

        // Try to locate the relevant iframe — wrap in try/catch in case the page
        // navigates again mid-call (execution context destroyed).
        logger.info('Looking for "OneNote File Browser" iframe...');
        let frameElement = null;
        try {
            frameElement = await page.$('#FileBrowserIFrame');
        } catch (e) {
            logger.warn(`Could not query #FileBrowserIFrame (${e.message}) — falling back to main page.`);
        }
        let frame = null;

        if (frameElement) {
            logger.success('Found iframe element #FileBrowserIFrame, switching to it...');
            try {
                frame = await frameElement.contentFrame();
            } catch (e) {
                logger.warn(`contentFrame() failed (${e.message}) — falling back to main page.`);
            }

            if (frame) {
                if (options.dodump) {
                    const dumpDir = await logger.getDumpDir();
                    const displayPath = logger.getDumpDisplayPath();
                    logger.warn(`Dumping iframe content to ${displayPath}/debug_frame_dump.html...`);
                    const frameContent = await frame.content();
                    await fs.writeFile(path.join(dumpDir, 'debug_frame_dump.html'), frameContent);
                }
            } else {
                logger.error('Could not get contentFrame() from element.');
            }
        } else {
            logger.error('Could not find #FileBrowserIFrame in main page.');
            // Fallback to main page if iframe not found
            frame = page;
        }

        let notebooks = [];
        const maxRetries = 10;

        // Use the identified frame (or page) for scraping
        const scrapeTarget = frame || page;

        for (let i = 0; i < maxRetries; i++) {
            logger.debug(`Attempt ${i + 1}/${maxRetries} to find notebooks in frame...`);

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
                logger.success(`Found ${notebooks.length} notebooks!`);
                break;
            }

            if (i < maxRetries - 1) {
                logger.debug('No notebooks found yet, waiting 5 seconds...');
                logger.info('Will wait 5 seconds to let the document load properly');
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
        logger.error('Error listing notebooks:', e);
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
    logger.info('Opening notebook...');
    const selector = `div[data-automationid="${notebookId}"] button[role="link"]`;

    try {
        const btn = await scrapeTarget.$(selector);
        if (!btn) {
            throw new Error(`Could not find button for notebook ${notebookId}`);
        }

        logger.debug('Clicking notebook link...');
        await Promise.all([
            page.waitForLoadState('domcontentloaded'),
            btn.click()
        ]);

        logger.success('Notebook opened!');
        logger.info('Will wait 5 seconds to let the document load properly');
        await page.waitForTimeout(5000);

    } catch (e) {
        logger.error('Failed to open notebook', e);
        throw e;
    }
}

/**
 * Opens a notebook directly by navigating to its full URL.
 * Returns a session object identical to the one returned by listNotebooks({ keepOpen: true }).
 *
 * @param {object} options  - { notheadless, dodump, notebookLink, ... }
 * @returns {{ browser, page, scrapeTarget, notebookName }}
 */
async function openNotebookByLink(options = {}) {
    const url = options.notebookLink;
    if (!url) throw new Error('openNotebookByLink: options.notebookLink is required');

    logger.info(`Opening notebook directly via link: ${url}`);

    const headless = !options.notheadless;
    logger.debug(`Launching browser (headless: ${headless})...`);

    const browser = await chromium.launch({ headless });
    try {
        const context = await getAuthenticatedContext(browser);
        const page = await context.newPage();

        logger.info('Navigating to notebook URL...');
        await page.goto(url);

        try {
            await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
        } catch (e) {
            logger.warn('Page load timeout, proceeding anyway...');
        }

        logger.info('Waiting for page to fully settle after redirects...');
        try {
            await page.waitForLoadState('networkidle', { timeout: 45000 });
        } catch (e) {
            logger.warn('Network idle timeout — continuing anyway...');
        }

        // Dismiss MCAS "Use Edge Browser" interstitial if present
        await dismissMcasInterstitial(page);

        // Extra grace period for SPA JS rendering
        logger.info('Will wait 5 seconds to let the document load properly');
        await page.waitForTimeout(5000);

        if (options.dodump) {
            const dumpDir = await logger.getDumpDir();
            const displayPath = logger.getDumpDisplayPath();
            logger.warn(`Dumping page content to ${displayPath}/debug_notebook_link.html...`);
            const content = await page.content();
            await fs.writeFile(path.join(dumpDir, 'debug_notebook_link.html'), content);
        }

        // Try to extract the notebook name from the page title or URL
        let notebookName = 'Notebook';
        try {
            const title = await page.title();
            if (title && title.trim()) {
                // OneNote page titles are usually "Notebook Name - Microsoft OneNote"
                notebookName = title.replace(/ ?[-–|] ?Microsoft OneNote.*$/i, '').trim() || notebookName;
            }
        } catch (e) {
            logger.warn('Could not read page title, using default name.');
        }

        logger.success(`Notebook opened (name detected: "${notebookName}")`);

        return { browser, page, scrapeTarget: page, notebookName };
    } catch (e) {
        logger.error('Failed to open notebook by link:', e);
        await browser.close();
        throw e;
    }
}

module.exports = {
    listNotebooks,
    openNotebook,
    openNotebookByLink
};
