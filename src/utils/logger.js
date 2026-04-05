const chalk = require('chalk');
const fs = require('fs-extra');
const path = require('path');

class Logger {
    constructor() {
        this.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        // Initialize dump directory name once per execution
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        
        // Format: YYYY-MM-DD_HHhMM (as per user request "h" vs ":" and "no single digits")
        this.dumpSubDir = `${yyyy}-${mm}-${dd}_${hh}h${min}`;
    }

    _getTimestamp() {
        const now = new Date();
        const month = this.months[now.getMonth()];
        const day = String(now.getDate()).padStart(2, '0');
        const time = now.toTimeString().split(' ')[0];
        return `[${month} ${day} ${time}]`;
    }

    /**
     * Returns the absolute path to the current session's dump directory.
     * Ensures the directory exists.
     * @returns {Promise<string>}
     */
    async getDumpDir() {
        const dumpDir = path.resolve(__dirname, '../../logs/dumps', this.dumpSubDir);
        await fs.ensureDir(dumpDir);
        return dumpDir;
    }

    /**
     * Returns a user-friendly relative path for logging.
     * @returns {string}
     */
    getDumpDisplayPath() {
        return `logs/dumps/${this.dumpSubDir}`;
    }

    _formatMessage(level, message, colorFunc = (m) => m) {
        const timestamp = chalk.gray(this._getTimestamp());
        const levelTag = colorFunc(`[${level}]`);

        // Handle multi-line messages
        if (typeof message === 'string' && message.includes('\n')) {
            return message.split('\n').map(line => `${timestamp} ${levelTag} ${line}`).join('\n');
        }

        // Handle objects/errors
        if (typeof message !== 'string') {
            try {
                const stringified = JSON.stringify(message, null, 2);
                return `${timestamp} ${levelTag} ${stringified}`;
            } catch (e) {
                return `${timestamp} ${levelTag} [Complex Object]`;
            }
        }

        return `${timestamp} ${levelTag} ${message}`;
    }

    info(message) {
        process.stdout.write(this._formatMessage('INFO', message, chalk.blue) + '\n');
    }

    warn(message) {
        process.stdout.write(this._formatMessage('WARN', message, chalk.yellow) + '\n');
    }

    error(message, error = null) {
        process.stderr.write(this._formatMessage('ERROR', message, chalk.red) + '\n');
        if (error) {
            if (error.stack) {
                process.stderr.write(chalk.red(error.stack) + '\n');
            } else {
                process.stderr.write(this._formatMessage('ERROR', error, chalk.red) + '\n');
            }
        }
    }

    success(message) {
        process.stdout.write(this._formatMessage('SUCCESS', message, chalk.green) + '\n');
    }

    debug(message) {
        process.stdout.write(this._formatMessage('DEBUG', message, chalk.gray) + '\n');
    }

    step(message) {
        process.stdout.write(this._formatMessage('STEP', message, chalk.magenta) + '\n');
    }
}

module.exports = new Logger();
