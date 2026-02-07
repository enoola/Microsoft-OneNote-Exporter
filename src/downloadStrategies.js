const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const { withRetry } = require('./utils/retry');

/**
 * Strategy 1: URL Transformation (Direct Download)
 * Attempts to force a download by appending download=1 to SharePoint/OneDrive URLs.
 */
async function tryDirectDownload(context, url, outputPath) {
    if (!url.includes('sharepoint.com') && !url.includes('onedrive.live.com') && !url.includes('1drv.ms')) {
        return false;
    }

    console.log(chalk.cyan(`      [Strategy: Direct] Attempting URL transformation...`));

    const separator = url.includes('?') ? '&' : '?';
    const downloadUrl = url + (url.includes('download=1') ? '' : separator + 'download=1');

    try {
        const response = await context.request.get(downloadUrl);
        const contentType = response.headers()['content-type'] || '';

        // Allow almost any content type for attachments, but exclude HTML (likely an error or sign-in page)
        if (response.ok() && !contentType.includes('text/html')) {
            await fs.writeFile(outputPath, await response.body());
            return true;
        }
    } catch (e) {
        // Log error and allow next strategy
        console.debug(`      Direct download failed for ${url.substring(0, 50)}...: ${e.message}`);
    }
    return false;
}

/**
 * Strategy 2: Physical Click
 * Triggers a download by clicking the element in the browser.
 */
async function tryUIClick(contentFrame, attachId, outputPath) {
    const page = contentFrame.page();
    const selector = `[data-one-attach-id="${attachId}"]`;

    // Wait for the element to be present
    const link = await contentFrame.waitForSelector(selector, { state: 'attached', timeout: 5000 }).catch(() => null);
    if (!link) {
        console.log(chalk.yellow(`      [Strategy: UI Click] Could not find clickable element for ${attachId}`));
        return false;
    }

    console.log(chalk.cyan(`      [Strategy: UI Click] Triggering click and waiting for download event...`));
    try {
        await link.scrollIntoViewIfNeeded();

        // Listen for BOTH download and popup
        const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
        const popupPromise = page.waitForEvent('popup', { timeout: 15000 });

        await link.click({ force: true });

        // Race the events
        const result = await Promise.race([
            downloadPromise.then(d => ({ type: 'download', value: d })),
            popupPromise.then(p => ({ type: 'popup', value: p })),
            new Promise(r => setTimeout(() => r({ type: 'timeout' }), 8000))
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
                const forcedUrl = popupUrl + (popupUrl.includes('download=1') ? '' : separator + 'download=1');

                try {
                    // Start navigation and wait for download in parallel
                    const [download] = await Promise.all([
                        page.waitForEvent('download', { timeout: 15000 }),
                        popup.goto(forcedUrl).catch(() => null)
                    ]);
                    await download.saveAs(outputPath);
                    await popup.close().catch(() => null);
                    return true;
                } catch (e) {
                    await popup.close().catch(() => null);
                }
            } else {
                await popup.close().catch(() => null);
            }
        }
    } catch (e) {
        console.debug(`      UI click strategy failed for ${attachId}: ${e.message}`);
    }
    return false;
}

/**
 * Strategy 3: Network Interception (Advanced)
 * Placeholder for future implementation if needed (intercepting fetch/xhr).
 */
async function tryNetworkInterception(page, url, outputPath) {
    // Current downloadResource is essentially an unforced network request
    // We could use page.route here if we need to mock headers.
    return false;
}

/**
 * Main dispatcher for attachment downloads
 */
async function downloadAttachment(contentFrame, info, outputPath) {
    return withRetry(async () => {
        const context = contentFrame.page().context();

        // 1. Try direct download (URL magic)
        if (await tryDirectDownload(context, info.src, outputPath)) {
            console.log(chalk.green(`      [Success] Downloaded via Strategy: Direct`));
            return true;
        }

        // 2. Try UI click
        if (await tryUIClick(contentFrame, info.id, outputPath)) {
            console.log(chalk.green(`      [Success] Downloaded via Strategy: UI Click`));
            return true;
        }

        // 3. Last fallback: direct request on the original URL
        console.log(chalk.cyan(`      [Strategy: Fallback] Attempting direct request...`));
        const response = await context.request.get(info.src);
        if (response.ok()) {
            const contentType = response.headers()['content-type'] || '';
            if (!contentType.includes('text/html')) {
                await fs.writeFile(outputPath, await response.body());
                console.log(chalk.green(`      [Success] Downloaded via Strategy: Fallback`));
                return true;
            }
        }

        throw new Error(`All download strategies failed for ${info.originalName}`);
    }, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        operationName: `Download attachment ${info.originalName}`,
        silent: true
    }).catch(e => {
        console.error(`      Error: ${e.message}`);
        return false;
    });
}

module.exports = {
    downloadAttachment
};
