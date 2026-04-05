const { chromium } = require('playwright');
const fs = require('fs-extra');
const logger = require('./utils/logger');
const { AUTH_FILE, ONENOTE_URL } = require('./config');
const readline = require('readline');

// Companion metadata file — stores email + login time for the GUI display
const AUTH_META_FILE = AUTH_FILE.replace('auth.json', 'auth-meta.json');

/** Returns { email, loginTime } from auth-meta.json, or null if not found. */
async function getAuthMeta() {
    try {
        if (await fs.pathExists(AUTH_META_FILE)) {
            return await fs.readJson(AUTH_META_FILE);
        }
    } catch (e) { }
    return null;
}

/** Deletes auth.json and auth-meta.json (full logout). */
async function logout() {
    await fs.remove(AUTH_FILE);
    await fs.remove(AUTH_META_FILE);
}

/**
 * Prompts the user for input in the terminal.
 */
function promptUser(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

async function login(credentials = {}) {
    const { login: email, password } = credentials;
    const isAutomated = !!(email && password);
    const headless = !credentials.notheadless && isAutomated;

    // Added to verify version on user's machine
    logger.debug('Authentication Module: Version 4.4-DEBUG starting...');

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

                logger.info('Email entered. Clicking "Next"...');
                await page.click('input[type="submit"]');

                // CRITICAL: Wait for the email field to disappear or the page to change
                logger.debug('Waiting for email field to disappear...');
                await page.waitForSelector('input[name="loginfmt"]', { state: 'hidden', timeout: 15000 }).catch(() => {
                    logger.debug('Email field still present, proceeding with caution.');
                });

                // Give the UI a moment to settle into the next screen (MFA/Password)
                await page.waitForTimeout(1000);

                // Check if an error appeared immediately after clicking Next (e.g. invalid email)
                const usernameError = page.locator('#usernameError');
                if (await usernameError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await usernameError.textContent();
                    throw new Error(`Login Error (Username): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                logger.error(`Failed to enter email: ${e.message}`);
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_email.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.error(`Email submission failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after email step (before MFA detection)
            if (credentials.dodump) {
                const debugFile = 'debug_after_email.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                logger.debug(`[dodump] Post-email state dumped to ${debugFile}`);
            }

            // 1.5. Handle intermediate screens (MFA selection, "Other ways to sign in")
            try {
                // Re-poll the page state after the stabilization delay
                const pageTitle = (await page.title()).trim();
                const pageHeading = (await page.locator('h1, [role="heading"]').first().textContent().catch(() => '')).trim();

                logger.debug(`Settled State: Title="${pageTitle}" | Heading="${pageHeading}"`);
                logger.debug('Checking for intermediate MFA/Sign-in option screens...');

                // We'll race between several possible states.
                // We strongly prioritize MFA headings and "Other ways" links.

                const result = await Promise.race([
                    page.waitForSelector('text=/Other ways to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Get a code to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Verify your identity/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                    page.waitForSelector('text=/Approve a request on my Microsoft Authenticator app/i', { state: 'visible', timeout: 5000 }).then(() => 'approve_app'),
                    // Only match password if it's REALLY there and we've waited a bit
                    page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 15000 }).then(() => 'password'),
                    // Fallback for some weird MFA screens where heading is the only clue
                    page.waitForFunction(() => {
                        const h = document.querySelector('h1, [role="heading"]')?.textContent || '';
                        return h.includes('Get a code') || h.includes('Verify your identity');
                    }, { timeout: 15000 }).then(() => 'other_ways'),
                ]).catch((err) => {
                    logger.debug(`Detection race timed out or failed: ${err.message}`);
                    return 'timeout';
                });

                logger.debug(`Intermediate screen detection result: ${result}`);

                // Proactive dump when intermediate screen is reached
                if (credentials.dodump) {
                    const debugFile = 'debug_intermediate_screen.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.debug(`[dodump] Intermediate screen state dumped to ${debugFile}`);
                }

                if (result === 'other_ways' || pageHeading.includes('Get a code') || pageHeading.includes('Verify your identity')) {
                    logger.info('Detected MFA/Verification screen. Attempting to locate "Other ways to sign in"...');

                    // Use built-in Playwright locators which are more robust
                    const otherWays = page.getByRole('button', { name: /Other ways to sign in|Sign in another way/i })
                        .or(page.getByText(/Other ways to sign in|Sign in another way/i))
                        .first();

                    try {
                        // Wait up to 15s for it to be attached
                        logger.debug('Waiting for "Other ways" link to appear in DOM...');
                        await otherWays.waitFor({ state: 'attached', timeout: 15000 });

                        // Log its visibility status for debugging
                        const isVisible = await otherWays.isVisible();
                        logger.debug(`"Other ways" link visibility: ${isVisible}`);

                        logger.info('Clicking "Other ways to sign in"...');
                        // Multiple click attempts: standard, then forced, then JS
                        try {
                            await otherWays.click({ timeout: 5000 });
                        } catch (e) {
                            logger.debug(`Standard click failed, trying forced: ${e.message}`);
                            await otherWays.click({ force: true, timeout: 5000 });
                        }
                    } catch (e) {
                        logger.warn(`MFA link interaction failed: ${e.message}`);

                        // Final fallback: try to find and click via JS evaluate
                        logger.debug('Attempting final fallback: JavaScript-based click...');
                        const clicked = await page.evaluate(() => {
                            const elements = Array.from(document.querySelectorAll('span, a, button'));
                            const target = elements.find(el =>
                                el.textContent.toLowerCase().includes('other ways to sign in') ||
                                el.textContent.toLowerCase().includes('sign in another way')
                            );
                            if (target) {
                                target.click();
                                return true;
                            }
                            return false;
                        });

                        if (clicked) {
                            logger.info('Successfully triggered click via JavaScript fallback.');
                        } else if (pageHeading.includes('Get a code')) {
                            throw new Error('STUCK: "Other ways to sign in" link not found even via JS scan.');
                        }
                    }

                    // Wait for the next screen (selection of verification method)
                    logger.debug('Waiting for method selection screen ("Use your password")...');
                    // Use a longer timeout for the switch, sometimes it's slow
                    const subResult = await Promise.race([
                        page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('#idA_PWD_SwitchToPassword', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('text=/Select a verification method/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways_list'),
                    ]).catch(() => 'timeout');

                    logger.debug(`Sub-screen detection result: ${subResult}`);

                    if (subResult === 'use_password') {
                        logger.info('Selecting "Use your password" option...');
                        await page.click('text=/Use your password/i');
                    } else if (subResult === 'other_ways_list') {
                        logger.info('Selection list detected. Looking for "Password"...');
                        await page.click('text=/Password|Use your password/i');
                    }
                } else if (result === 'use_password') {
                    logger.info('Detected "Use your password" option. Clicking...');
                    await page.click('text="Use your password"');
                } else if (result === 'approve_app') {
                    logger.warn('MFA notification already sent. Attempting to switch to password...');
                    const otherLink = page.locator('text="Other ways to sign in", #signInAnotherWay').first();
                    if (await otherLink.isVisible()) {
                        await otherLink.click();
                        await page.waitForSelector('text="Use your password"', { state: 'visible', timeout: 10000 });
                        await page.click('text="Use your password"');
                    }
                } else if (result === 'password') {
                    logger.debug('Direct password field detected.');
                } else if (result === 'timeout') {
                    logger.debug('No intermediate screen detected within timeout. Proceeding to password entry.');
                }
            } catch (e) {
                logger.debug(`Intermediate screen handler encountered a fatal issue: ${e.message}`);
            }

            // 2. Enter Password
            try {
                // Wait for password field to appear
                // Wait for password field and be sure it's the right one
                await page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="passwd"]', password);

                // Click the submit button on the password page. 
                // We use a more specific selector and wait for it to be enabled.
                const submitButton = page.locator('input[type="submit"], button[type="submit"]').filter({ hasText: /Sign in|Next|Finish/i }).first();

                logger.debug('Waiting for submit button to be enabled...');
                await submitButton.waitFor({ state: 'visible', timeout: 10000 });
                // If it's still disabled, we might be on the wrong screen or input is missing
                if (await submitButton.isDisabled()) {
                    logger.debug('Submit button is disabled. It might be the wrong one or the password field is not considered filled.');
                    // Try to click anyway as a fallback, or wait a bit longer
                    await page.waitForTimeout(1000);
                }

                await submitButton.click();

                // Check for password error (e.g. incorrect password)
                const passwordError = page.locator('#passwordError');
                if (await passwordError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await passwordError.textContent();
                    throw new Error(`Login Error (Password): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_password.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.error(`Password entry failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after password submission (before post-password MFA check)
            if (credentials.dodump) {
                const debugFile = 'debug_after_password.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                logger.debug(`[dodump] Post-password state dumped to ${debugFile}`);
            }

            // 2.5. Handle post-password MFA/Verification if needed
            try {
                // Check if we are stuck on a verification screen
                // Includes new Number Matching MFA ("Approve sign in request" with a displayed number)
                const verificationScreen = await Promise.race([
                    page.waitForSelector('text="Verify your identity"', { timeout: 10000 }).then(() => 'verify'),
                    page.waitForSelector('text="Enter code"', { timeout: 10000 }).then(() => 'enter_code'),
                    page.waitForSelector('input[name="otc"]', { timeout: 10000 }).then(() => 'otc_input'),
                    // Number Matching MFA: corporate accounts show a number the user must enter in Authenticator
                    page.waitForSelector('text=/Approve sign in request/i', { timeout: 10000 }).then(() => 'number_match'),
                    page.waitForSelector('.displaySign', { timeout: 10000 }).then(() => 'number_match'),
                ]).catch(() => null);

                if (credentials.dodump) {
                    const debugFile = 'debug_post_password_mfa.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    logger.debug(`[dodump] Post-password MFA screen state dumped to ${debugFile}`);
                }

                if (verificationScreen === 'number_match') {
                    // ── Number Matching MFA (corporate accounts) ──────────────────────────
                    // Microsoft shows a 2-digit number; user must enter it in Authenticator
                    // app on their phone and tap OK — the page then auto-advances.
                    // No browser interaction is required after extracting the number.
                    logger.warn('Number Matching MFA detected ("Approve sign in request" screen).');

                    let matchNumber = '??';
                    try {
                        matchNumber = await page.$eval('.displaySign', el => el.textContent.trim());
                    } catch (_) {
                        logger.debug('Could not extract number from .displaySign — user may still see it if --notheadless is used.');
                    }

                    logger.step('══════════════════════════════════════════════════════');
                    logger.step(`  ACTION REQUIRED: Open Microsoft Authenticator on your phone.`);
                    logger.step(`  Enter the number:  ${matchNumber}`);
                    logger.step(`  Then tap "Yes" / "Approve" in the app.`);
                    logger.step('══════════════════════════════════════════════════════');
                    logger.info('Waiting for phone approval (up to 120 seconds)...');

                    // Wait for the page to auto-advance after phone approval.
                    // The MFA page disappears and Microsoft redirects to the next step.
                    await Promise.race([
                        page.waitForSelector('.displaySign', { state: 'hidden', timeout: 120000 }),
                        page.waitForURL(url => !url.toString().includes('login.microsoftonline.com'), { timeout: 120000 }),
                        page.waitForSelector('text=/Stay signed in/i', { timeout: 120000 }),
                    ]);

                    logger.success('Phone approval received. Continuing login flow...');

                } else if (verificationScreen) {
                    // ── OTC / TOTP code (email / authenticator code) ──────────────────────
                    logger.warn('MFA/Verification screen detected.');
                    logger.step('A verification code is required. Please check your email or authenticator app.');

                    const code = await promptUser('Enter the verification code: ');

                    if (await page.locator('input[name="otc"]').isVisible()) {
                        await page.fill('input[name="otc"]', code);
                    } else if (await page.locator('input[type="tel"]').isVisible()) {
                        await page.fill('input[type="tel"]', code);
                    } else {
                        // Fallback: try to find any visible text input
                        await page.locator('input[type="text"]:visible, input[type="tel"]:visible').first().fill(code);
                    }

                    await page.click('input[type="submit"]');
                }
            } catch (e) {
                logger.debug(`Post-password verification handling skipped or failed: ${e.message}`);
            }
            // 2.7. Handle "Help protect your account" interrupt screen
            try {
                // This screen may appear after password entry
                const interruptPrompt = page.getByText(/Help protect your account/i).first();
                if (await interruptPrompt.isVisible({ timeout: 5000 }) || page.url().includes('account.live.com/interrupt/')) {
                    logger.info('Detected "Help protect your account" interrupt screen.');
                    const skipButton = page.getByRole('button', { name: /Skip for now/i })
                        .or(page.getByText(/Skip for now/i))
                        .first();
                    if (await skipButton.isVisible()) {
                        logger.info('Clicking "Skip for now"...');
                        await skipButton.click();
                    }
                }
            } catch (e) {
                logger.debug(`Help protect your account interrupt screen did not appear: ${e.message}`);
            }

            // 3. Handle "Stay signed in?" prompt if it appears
            try {
                // This step might not always appear depending on the account state
                logger.debug('Checking for "Stay signed in?" prompt...');

                // Use built-in locators for detection
                const staySignedIn = page.getByText(/Stay signed in?/i)
                    .or(page.locator('#KmsiDescription'))
                    .first();

                // Wait for the prompt with a reasonable timeout
                await staySignedIn.waitFor({ state: 'visible', timeout: 7000 });

                logger.info('Detected "Stay signed in?" prompt.');

                // Optionally check "Don't show this again" if it exists
                const dontShowAgain = page.locator('input[name="DontShowAgain"], #KmsiCheckboxField').first();
                if (await dontShowAgain.isVisible()) {
                    logger.debug('Checking "Don\'t show this again" checkbox...');
                    await dontShowAgain.check().catch(() => { });
                }

                // The provided HTML shows a button with text "Yes" and data-testid="primaryButton"
                const yesButton = page.getByRole('button', { name: /^Yes$/i })
                    .or(page.locator('button[data-testid="primaryButton"]'))
                    .or(page.locator('#idSIButton9'))
                    .first();

                logger.info('Clicking "Yes" to stay signed in...');
                await yesButton.click();
            } catch (e) {
                logger.debug(`Stay signed in prompt did not appear or was not recognized: ${e.message}`);
                // If we hit a timeout, it might just be the redirect already happened
            }

            // 4. Wait for redirection to notebooks list
            try {
                logger.info('Waiting for redirection to notebooks list...');

                // Wait for either the URL pattern or a success indicator in the DOM
                await Promise.any([
                    page.waitForURL(url => url.toString().includes('/notebooks') || url.hostname.includes('onenote.cloud.microsoft') || url.hostname.includes('onenote.com'), { timeout: 60000 }),
                    page.waitForSelector('text="My notebooks"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Create new notebook"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Welcome, "', { state: 'visible', timeout: 60000 })
                ]);

                logger.success('Notebooks list detected.');
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_notebooks.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
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
        
        // Persist email + time so that check command can show the logged-in user
        await fs.writeJson(AUTH_META_FILE, {
            email: email || 'manual login',
            loginTime: new Date().toISOString()
        });
        
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
    if (!(await fs.pathExists(AUTH_FILE))) {
        return false;
    }

    let browser;
    try {
        logger.debug('Verifying authentication session...');
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ storageState: AUTH_FILE });
        const page = await context.newPage();

        // Go to OneNote URL
        await page.goto(ONENOTE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Wait briefly to allow client-side redirects to Microsoft login pages if session is dead
        await page.waitForTimeout(2000);

        const url = page.url();
        const isLoginUrl = url.includes('login.live.com') || url.includes('login.microsoftonline.com');

        if (isLoginUrl) {
            logger.warn('Authentication session has expired. Deleting stale auth state.');
            await logout();
            return false;
        }

        // Check for common error pages or other signs of invalid auth if necessary
        return true;
    } catch (e) {
        logger.debug(`Session verification encountered an error (timeout/network): ${e.message}`);
        // If we couldn't load the page properly due to network or timeout, 
        // we default to true to prevent accidentally logging out the user.
        return true;
    } finally {
        logger.debug(`Looks like user is logged in.`);
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Electron-aware login adapter.
 * Identical logic to login() but emits progress via sendEvent(type, payload)
 * instead of using readline stdin or the logger module.
 *
 * @param {object} credentials  - { login, password, notheadless, dodump }
 * @param {function} sendEvent  - (type, payload) => void — forwards events to the renderer
 * @param {object} ipcMain      - the electron ipcMain, used for OTC round-trip dialogs
 */
async function loginForElectron(credentials = {}, sendEvent, ipcMain) {
    const { login: email, password } = credentials;
    const isAutomated = !!(email && password);
    const headless = !credentials.notheadless && isAutomated;

    const log = (level, message) => sendEvent('log', { level, message });

    log('debug', 'Authentication Module: Version 4.4-DEBUG starting (Electron mode)...');

    if (isAutomated) {
        log('info', `Attempting automated login for ${email}...`);
    } else {
        log('info', 'Launching browser for manual authentication...');
        log('warn', 'Please log in to your Microsoft account in the browser window.');
        log('warn', 'The script will wait until you successfully reach the notebook list.');
    }

    const browser = await chromium.launch({ headless: !!headless });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(ONENOTE_URL);

        if (isAutomated) {
            log('step', 'Automating login steps...');

            // 0. Handle landing page
            try {
                const signInButton = page.getByRole('button', { name: 'Sign in' }).first();
                await signInButton.waitFor({ state: 'visible', timeout: 10000 });
                log('info', 'Landing page detected. Clicking "Sign in"...');
                await signInButton.click({ noWaitAfter: true });
                log('debug', 'Clicked "Sign in", waiting for login form...');
            } catch (e) {
                log('debug', 'Landing page not detected or "Sign in" button not found within timeout.');
            }

            // 1. Enter Email
            try {
                await page.waitForSelector('input[name="loginfmt"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="loginfmt"]', email);
                log('info', 'Email entered. Clicking "Next"...');
                await page.click('input[type="submit"]');
                log('debug', 'Waiting for email field to disappear...');
                await page.waitForSelector('input[name="loginfmt"]', { state: 'hidden', timeout: 15000 }).catch(() => {
                    log('debug', 'Email field still present, proceeding with caution.');
                });
                await page.waitForTimeout(1000);
                const usernameError = page.locator('#usernameError');
                if (await usernameError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await usernameError.textContent();
                    throw new Error(`Login Error (Username): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                log('error', `Failed to enter email: ${e.message}`);
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_email.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    log('error', `Email submission failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after email step (before MFA detection)
            if (credentials.dodump) {
                const debugFile = 'debug_after_email.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                log('debug', `[dodump] Post-email state dumped to ${debugFile}`);
            }

            // 1.5. Handle intermediate screens (MFA selection)
            try {
                const pageTitle = (await page.title()).trim();
                const pageHeading = (await page.locator('h1, [role="heading"]').first().textContent().catch(() => '')).trim();
                log('debug', `Settled State: Title="${pageTitle}" | Heading="${pageHeading}"`);
                log('debug', 'Checking for intermediate MFA/Sign-in option screens...');

                const result = await Promise.race([
                    page.waitForSelector('text=/Other ways to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Get a code to sign in/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Verify your identity/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways'),
                    page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                    page.waitForSelector('text=/Approve a request on my Microsoft Authenticator app/i', { state: 'visible', timeout: 5000 }).then(() => 'approve_app'),
                    page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 15000 }).then(() => 'password'),
                    page.waitForFunction(() => {
                        const h = document.querySelector('h1, [role="heading"]')?.textContent || '';
                        return h.includes('Get a code') || h.includes('Verify your identity');
                    }, { timeout: 15000 }).then(() => 'other_ways'),
                ]).catch((err) => {
                    log('debug', `Detection race timed out or failed: ${err.message}`);
                    return 'timeout';
                });

                log('debug', `Intermediate screen detection result: ${result}`);

                // Proactive dump when intermediate screen is reached
                if (credentials.dodump) {
                    const debugFile = 'debug_intermediate_screen.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    log('debug', `[dodump] Intermediate screen state dumped to ${debugFile}`);
                }

                if (result === 'other_ways' || pageHeading.includes('Get a code') || pageHeading.includes('Verify your identity')) {
                    log('info', 'Detected MFA/Verification screen. Attempting to locate "Other ways to sign in"...');
                    const otherWays = page.getByRole('button', { name: /Other ways to sign in|Sign in another way/i })
                        .or(page.getByText(/Other ways to sign in|Sign in another way/i)).first();
                    try {
                        await otherWays.waitFor({ state: 'attached', timeout: 15000 });
                        const isVisible = await otherWays.isVisible();
                        log('debug', `"Other ways" link visibility: ${isVisible}`);
                        log('info', 'Clicking "Other ways to sign in"...');
                        try {
                            await otherWays.click({ timeout: 5000 });
                        } catch (e) {
                            await otherWays.click({ force: true, timeout: 5000 });
                        }
                    } catch (e) {
                        log('warn', `MFA link interaction failed: ${e.message}`);
                        const clicked = await page.evaluate(() => {
                            const elements = Array.from(document.querySelectorAll('span, a, button'));
                            const target = elements.find(el =>
                                el.textContent.toLowerCase().includes('other ways to sign in') ||
                                el.textContent.toLowerCase().includes('sign in another way')
                            );
                            if (target) { target.click(); return true; }
                            return false;
                        });
                        if (!clicked && pageHeading.includes('Get a code')) {
                            throw new Error('STUCK: "Other ways to sign in" link not found even via JS scan.');
                        }
                    }
                    const subResult = await Promise.race([
                        page.waitForSelector('text=/Use your password/i', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('#idA_PWD_SwitchToPassword', { state: 'visible', timeout: 15000 }).then(() => 'use_password'),
                        page.waitForSelector('text=/Select a verification method/i', { state: 'visible', timeout: 15000 }).then(() => 'other_ways_list'),
                    ]).catch(() => 'timeout');

                    if (subResult === 'use_password') {
                        log('info', 'Selecting "Use your password" option...');
                        await page.click('text=/Use your password/i');
                    } else if (subResult === 'other_ways_list') {
                        await page.click('text=/Password|Use your password/i');
                    }
                } else if (result === 'use_password') {
                    await page.click('text="Use your password"');
                } else if (result === 'approve_app') {
                    const otherLink = page.locator('text="Other ways to sign in", #signInAnotherWay').first();
                    if (await otherLink.isVisible()) {
                        await otherLink.click();
                        await page.waitForSelector('text="Use your password"', { state: 'visible', timeout: 10000 });
                        await page.click('text="Use your password"');
                    }
                }
            } catch (e) {
                log('debug', `Intermediate screen handler encountered a fatal issue: ${e.message}`);
            }

            // 2. Enter Password
            try {
                await page.waitForSelector('input[name="passwd"]', { state: 'visible', timeout: 30000 });
                await page.fill('input[name="passwd"]', password);
                const submitButton = page.locator('input[type="submit"], button[type="submit"]').filter({ hasText: /Sign in|Next|Finish/i }).first();
                await submitButton.waitFor({ state: 'visible', timeout: 10000 });
                if (await submitButton.isDisabled()) { await page.waitForTimeout(1000); }
                await submitButton.click();
                const passwordError = page.locator('#passwordError');
                if (await passwordError.isVisible({ timeout: 2000 })) {
                    const errorMsg = await passwordError.textContent();
                    throw new Error(`Login Error (Password): ${errorMsg?.trim()}`);
                }
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_password.html';
                    await fs.writeFile(debugFile, await page.content().catch(err => `<!-- Error: ${err.message} -->`));
                    log('error', `Password entry failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }

            // Proactive dump after password submission (before post-password MFA check)
            if (credentials.dodump) {
                const debugFile = 'debug_after_password.html';
                await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                log('debug', `[dodump] Post-password state dumped to ${debugFile}`);
            }

            // 2.5. Handle post-password MFA/Verification (OTC prompt via GUI dialog)
            //      Also handles Number Matching MFA (corporate accounts)
            try {
                const verificationScreen = await Promise.race([
                    page.waitForSelector('text="Verify your identity"', { timeout: 10000 }).then(() => 'verify'),
                    page.waitForSelector('text="Enter code"', { timeout: 10000 }).then(() => 'enter_code'),
                    page.waitForSelector('input[name="otc"]', { timeout: 10000 }).then(() => 'otc_input'),
                    // Number Matching MFA: corporate accounts show a number to enter in Authenticator
                    page.waitForSelector('text=/Approve sign in request/i', { timeout: 10000 }).then(() => 'number_match'),
                    page.waitForSelector('.displaySign', { timeout: 10000 }).then(() => 'number_match'),
                ]).catch(() => null);

                if (credentials.dodump) {
                    const debugFile = 'debug_post_password_mfa.html';
                    await fs.writeFile(debugFile, await page.content().catch(e => `<!-- Error: ${e.message} -->`));
                    log('debug', `[dodump] Post-password MFA screen state dumped to ${debugFile}`);
                }

                if (verificationScreen === 'number_match') {
                    // ── Number Matching MFA (corporate accounts) ──────────────────────────
                    // Microsoft shows a 2-digit number; user must enter it in Authenticator
                    // on their phone and tap OK — the page then auto-advances.
                    log('warn', 'Number Matching MFA detected ("Approve sign in request" screen).');

                    let matchNumber = '??';
                    try {
                        matchNumber = await page.$eval('.displaySign', el => el.textContent.trim());
                    } catch (_) {
                        log('debug', 'Could not extract number from .displaySign.');
                    }

                    // Notify the Electron renderer — it will show a waiting popup to the user
                    sendEvent('mfa-number-match', { number: matchNumber });
                    log('warn', `Number Matching MFA — user must enter ${matchNumber} in Microsoft Authenticator.`);

                    // Wait silently for phone approval to auto-advance the page (no browser action needed)
                    log('info', 'Waiting for phone approval (up to 120 seconds)...');
                    await Promise.race([
                        page.waitForSelector('.displaySign', { state: 'hidden', timeout: 120000 }),
                        page.waitForURL(url => !url.toString().includes('login.microsoftonline.com'), { timeout: 120000 }),
                        page.waitForSelector('text=/Stay signed in/i', { timeout: 120000 }),
                    ]);

                    log('success', 'Phone approval received. Continuing login flow...');
                    sendEvent('mfa-number-match-approved', {});

                } else if (verificationScreen) {
                    // ── OTC / TOTP code prompt ─────────────────────────────────────────────
                    log('warn', 'MFA/Verification screen detected.');
                    log('step', 'A verification code is required. Please check your email or authenticator app.');

                    // Ask the renderer to show the OTC dialog and wait for user input via IPC
                    sendEvent('otc-required', {});
                    const code = await new Promise((resolve) => {
                        ipcMain.once('otc-reply', (event, value) => resolve(value));
                    });

                    if (await page.locator('input[name="otc"]').isVisible()) {
                        await page.fill('input[name="otc"]', code);
                    } else if (await page.locator('input[type="tel"]').isVisible()) {
                        await page.fill('input[type="tel"]', code);
                    } else {
                        await page.locator('input[type="text"]:visible, input[type="tel"]:visible').first().fill(code);
                    }
                    await page.click('input[type="submit"]');
                }
            } catch (e) {
                log('debug', `Post-password verification handling skipped or failed: ${e.message}`);
            }
            // 2.7. Handle "Help protect your account" interrupt screen
            try {
                const interruptPrompt = page.getByText(/Help protect your account/i).first();
                if (await interruptPrompt.isVisible({ timeout: 5000 }) || page.url().includes('account.live.com/interrupt/')) {
                    log('info', 'Detected "Help protect your account" interrupt screen.');
                    const skipButton = page.getByRole('button', { name: /Skip for now/i })
                        .or(page.getByText(/Skip for now/i))
                        .first();
                    if (await skipButton.isVisible()) {
                        log('info', 'Clicking "Skip for now"...');
                        await skipButton.click();
                    }
                }
            } catch (e) {
                log('debug', `Help protect your account interrupt screen did not appear: ${e.message}`);
            }

            // 3. Handle "Stay signed in?" prompt
            try {
                const staySignedIn = page.getByText(/Stay signed in?/i).or(page.locator('#KmsiDescription')).first();
                await staySignedIn.waitFor({ state: 'visible', timeout: 7000 });
                log('info', 'Detected "Stay signed in?" prompt.');
                const dontShowAgain = page.locator('input[name="DontShowAgain"], #KmsiCheckboxField').first();
                if (await dontShowAgain.isVisible()) { await dontShowAgain.check().catch(() => { }); }
                const yesButton = page.getByRole('button', { name: /^Yes$/i })
                    .or(page.locator('button[data-testid="primaryButton"]'))
                    .or(page.locator('#idSIButton9')).first();
                log('info', 'Clicking "Yes" to stay signed in...');
                await yesButton.click();
            } catch (e) {
                log('debug', `Stay signed in prompt did not appear: ${e.message}`);
            }

            // 4. Wait for redirect to notebooks list
            try {
                log('info', 'Waiting for redirection to notebooks list...');
                await Promise.any([
                    page.waitForURL(url => url.toString().includes('/notebooks') || url.hostname.includes('onenote.cloud.microsoft') || url.hostname.includes('onenote.com'), { timeout: 60000 }),
                    page.waitForSelector('text="My notebooks"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Create new notebook"', { state: 'visible', timeout: 60000 }),
                    page.waitForSelector('text="Welcome, "', { state: 'visible', timeout: 60000 })
                ]);
                log('success', 'Notebooks list detected.');
            } catch (e) {
                if (credentials.dodump) {
                    const debugFile = 'debug_login_error_notebooks.html';
                    await fs.writeFile(debugFile, await page.content().catch(err => `<!-- Error: ${err.message} -->`));
                    log('error', `Success detection failed. HTML dumped to ${debugFile}`);
                }
                throw e;
            }
        } else {
            // Manual login: tell the renderer to show the "waiting" state
            log('warn', 'Manual login flow — please log in in the browser window that just opened.');
            sendEvent('manual-login-ready', {});
            // Wait for the renderer to send 'manual-login-confirmed' (user clicks "I've logged in" button)
            await new Promise((resolve) => {
                ipcMain.once('manual-login-confirmed', () => resolve());
            });
        }

        log('info', 'Saving authentication state...');
        await context.storageState({ path: AUTH_FILE });
        // Persist email + time so the GUI can show "Logged in as X since HH:MM"
        await fs.writeJson(AUTH_META_FILE, {
            email: email || 'manual login',
            loginTime: new Date().toISOString()
        });
        log('success', `Authentication successful! State saved to ${AUTH_FILE}`);
        return { success: true, email: email || 'manual login', loginTime: new Date().toISOString() };
    } catch (error) {
        log('error', `Authentication failed or cancelled: ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}

module.exports = {
    login,
    loginForElectron,
    getAuthenticatedContext,
    checkAuth,
    getAuthMeta,
    logout
};
