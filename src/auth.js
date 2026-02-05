const { chromium } = require('playwright');
const fs = require('fs-extra');
const chalk = require('chalk');
const { AUTH_FILE, ONENOTE_URL } = require('./config');

async function login() {
    console.log(chalk.blue('Launching browser for authentication...'));
    console.log(chalk.yellow('Please log in to your Microsoft account in the browser window.'));
    console.log(chalk.yellow('The script will wait until you successfully reach the notebook list.'));

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await page.goto(ONENOTE_URL);

        console.log(chalk.yellow('\nLogin flow requires manual interaction.'));
        console.log(chalk.bold.green('>>> Once you see your Notebooks list in the browser, return here and press ENTER to continue. <<<'));

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

        console.log(chalk.blue('Saving authentication state...'));

        await context.storageState({ path: AUTH_FILE });
        console.log(chalk.green(`Authentication successful! State saved to ${AUTH_FILE}`));
    } catch (error) {
        console.error(chalk.red('Authentication failed or cancelled:'), error);
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
