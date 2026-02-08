const chalk = require('chalk');

class Logger {
    constructor() {
        this.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }

    _getTimestamp() {
        const now = new Date();
        const month = this.months[now.getMonth()];
        const day = String(now.getDate()).padStart(2, '0');
        const time = now.toTimeString().split(' ')[0];
        return `[${month} ${day} ${time}]`;
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
