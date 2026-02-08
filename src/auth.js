const { chromium } = require('playwright');
const fs = require('fs-extra');
const logger = require('./utils/logger');
const { AUTH_FILE, ONENOTE_URL } = require('./config');

async function login(credentials = {}) {
    const { login: email, password } = credentials;
    const isAutomated = !!(email && password);
    const headless = !credentials.notheadless && isAutomated;

    if (isAutomated) {
        logger.info(`Attempting automated login for ${email}...`);
    } else {
        logger.info('Launching browser for manual authentication...');
        logger.warn('Please log in to your Microsoft account in the browser window.');
        logger.warn('The script will wait until you successfully reach the notebook list.');
    }

    const browser = await chromium.launch({ headless: !!headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(ONENOTE_URL);

        if (isAutomated) {
            logger.step('Automating login steps...');

            // 0. Handle landing page if it appears (redirection to onenote.cloud.microsoft)
            try {
                // Look for "Sign in" button. 
                // Using a more robust selector that targets the button by its accessible name.
                const signInButton = page.getByRole('button', { name: 'Sign in' }).first();

                // Properly wait for visibility
                await signInButton.waitFor({ state: 'visible', timeout: 10000 });

                logger.info('Landing page detected. Clicking "Sign in"...');

                // Clicking and waiting for a change - could be navigation or just URL change.
                // We use noWaitAfter: true because Microsoft pages often have multiple redirects
                // and we'll wait for the login form in the next step anyway.
                await signInButton.click({ noWaitAfter: true });

                // Wait for the login page to start loading or the email field to appear
                // Instead of waitForNavigation which is flaky with redirects, we just wait for the next step's selector
                logger.debug('Clicked "Sign in", waiting for login form...');
            } catch (e) {
                logger.debug('Landing page not detected or "Sign in" button not found within timeout.');
            }

            // 1. Enter Email
            try {
                // Wait for either lofinfmt OR a potential login.microsoftonline.com / login.live.com URL
                await page.waitForSelector('input[name="loginfmt"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="loginfmt"]', email);
                await page.click('input[type="submit"]');

                // Check if an error appeared immediately after clicking Next (e.g. invalid email)
                const usernameError = page.locator('#usernameError');
                if (await usernameError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await usernameError.textContent();
                    throw new Error(`Login Error (Username): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error.html';
                    await fs.writeFile(debugFile, await page.content());
                    logger.error(`Automation failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // 2. Enter Password
            try {
                // Wait for password field to appear
                await page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="passwd"]', password);
                await page.click('input[type="submit"]');

                // Check for password error (e.g. incorrect password)
                const passwordError = page.locator('#passwordError');
                if (await passwordError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await passwordError.textContent();
                    throw new Error(`Login Error (Password): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error.html';
                    await fs.writeFile(debugFile, await page.content());
                    logger.error(`Automation failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // 3. Handle "Stay signed in?" prompt if it appears
            try {
                // This step might not always appear depending on the account state
                await page.waitForSelector('input[name="DontShowAgain"]', { timeout: 5000 });
                await page.click('input[type="submit"]'); // Usually the "Yes" button
            } catch (e) {
                logger.debug('Stay signed in prompt did not appear or was not recognized.');
            }

            // 4. Wait for redirection to notebooks list
            try {
                logger.info('Waiting for redirection to notebooks list...');

                // Wait for either the URL pattern or a success indicator in the DOM
                await Promise.any([
                    page.waitForURL(url => url.toString().includes('/notebooks'), { timeout: 60000 }),
                    page.waitForSelector('text="My notebooks"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Create new notebook"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Welcome, "', { state: 'visible', timeout: 60000 })
                ]);

                logger.success('Notebooks list detected.');
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error.html';
                    await fs.writeFile(debugFile, await page.content());
                    logger.error(`Success detection failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }
        } else {
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
        }

        logger.info('Saving authentication state...');
        await context.storageState({ path: AUTH_FILE });
        logger.success(`Authentication successful! State saved to ${AUTH_FILE}`);
    } catch (error) {
        logger.error('Authentication failed or cancelled:', error);
        if (isAutomated) {
            logger.debug('Possible cause: incorrect credentials, MFA requirement, or selector change.');
        }
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
