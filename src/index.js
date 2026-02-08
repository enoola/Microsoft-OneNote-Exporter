#!/usr/bin/env node
const { program } = require('commander');
const logger = require('./utils/logger');
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
            logger.success('Authentication file found.');
        } else {
            logger.error('Authentication file NOT found. Run "login" first.');
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
            logger.step('\nAvailable Notebooks:');
            if (notebooks.length === 0) {
                logger.warn('No notebooks found or selector failed.');
                logger.debug('Try running with --notheadless to see what the scraper sees.');
            }
            notebooks.forEach((nb, index) => {
                logger.info(`${index + 1}. ${nb.name} (${nb.url})`);
            });
        } catch (e) {
            logger.error('Failed to list notebooks.', e);
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
