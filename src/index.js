#!/usr/bin/env node
const { program } = require('commander');
const chalk = require('chalk');
const { login, checkAuth } = require('./auth');
const { listNotebooks } = require('./navigator');
const { runExport } = require('./exporter');

program
    .name('onenote-export')
    .description('Export OneNote notebooks to Obsidian-compatible Markdown')
    .version('1.0.0');

program
    .command('login')
    .description('Authenticate with Microsoft Account')
    .action(async () => {
        await login();
    });

program
    .command('check')
    .description('Check if authenticated')
    .action(async () => {
        const isAuth = await checkAuth();
        if (isAuth) {
            console.log(chalk.green('Authentication file found.'));
        } else {
            console.log(chalk.red('Authentication file NOT found. Run "login" first.'));
        }
    });

program
    .command('list')
    .description('List available OneNote notebooks')
    .option('--notheadless', 'Run in visible browser mode for debugging')
    .option('--dodump', 'Dump HTML content to files for debugging')
    .action(async (options) => {
        try {
            const notebooks = await listNotebooks(options);
            console.log(chalk.bold('\nAvailable Notebooks:'));
            if (notebooks.length === 0) {
                console.log(chalk.yellow('No notebooks found or selector failed.'));
                console.log(chalk.gray('Try running with --notheadless to see what the scraper sees.'));
            }
            notebooks.forEach((nb, index) => {
                console.log(`${index + 1}. ${chalk.cyan(nb.name)} (${nb.url})`);
            });
        } catch (e) {
            console.error(chalk.red('Failed to list notebooks.'));
            console.error(e);
        }
    });

program
    .command('export')
    .description('Interactive export of a notebook')
    .option('--notheadless', 'Run in visible browser mode for debugging')
    .option('--dodump', 'Dump HTML content to files for debugging')
    .option('--nopassasked', 'Skip password-protected sections instead of asking')
    .option('--notebook <name>', 'Preselect notebook by name (skips interactive selection)')
    .action(async (options) => {
        await runExport(options);
    });

program.parse();
