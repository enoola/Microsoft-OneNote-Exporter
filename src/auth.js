const { chromium } = require('playwright');
const fs = require('fs-extra');
const logger = require('./utils/logger');
const { AUTH_FILE, ONENOTE_URL } = require('./config');

async function login() {
    logger.info('Launching browser for authentication...');
    logger.warn('Please log in to your Microsoft account in the browser window.');
    logger.warn('The script will wait until you successfully reach the notebook list.');

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(ONENOTE_URL);

        logger.warn('Login flow requires manual interaction.');
        logger.step('>>> Once you see your Notebooks list in the browser, return here and press ENTER to continue. <<<');

        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        await new Promise(resolve => {
            rl.question('', () => {
                rl.close();
                resolve();
            });
        });

        logger.info('Saving authentication state...');

        await context.storageState({ path: AUTH_FILE });
        logger.success(`Authentication successful! State saved to ${AUTH_FILE}`);
    } catch (error) {
        logger.error('Authentication failed or cancelled:', error);
    } finally {
        await browser.close();
    }
}

async function getAuthenticatedContext(browser) {
    if (await fs.pathExists(AUTH_FILE)) {
        return browser.newContext({ storageState: AUTH_FILE });
    } else {
        throw new Error('No authentication state found. Please run "login" command first.');
    }
}

async function checkAuth() {
    return fs.pathExists(AUTH_FILE);
}

module.exports = {
    login,
    getAuthenticatedContext,
    checkAuth
};
