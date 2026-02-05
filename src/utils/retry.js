const chalk = require('chalk');

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum number of attempts (default: 3)
 * @param {number} options.initialDelayMs - Initial delay in milliseconds (default: 500)
 * @param {number} options.maxDelayMs - Maximum delay in milliseconds (default: 5000)
 * @param {number} options.backoffMultiplier - Backoff multiplier (default: 2)
 * @param {string} options.operationName - Name of operation for logging (default: 'Operation')
 * @param {boolean} options.silent - Suppress retry logging (default: false)
 * @returns {Promise<any>} Result of the function
 * @throws {Error} If all attempts fail
 */
async function withRetry(fn, options = {}) {
    const {
        maxAttempts = 3,
        initialDelayMs = 500,
        maxDelayMs = 5000,
        backoffMultiplier = 2,
        operationName = 'Operation',
        silent = false
    } = options;

    let lastError;
    let delayMs = initialDelayMs;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            if (attempt === maxAttempts) {
                if (!silent) {
                    console.error(chalk.red(`${operationName} failed after ${maxAttempts} attempts: ${error.message}`));
                }
                throw error;
            }

            if (!silent) {
                console.log(chalk.yellow(`${operationName} failed (attempt ${attempt}/${maxAttempts}): ${error.message}`));
                console.log(chalk.gray(`  Retrying in ${delayMs}ms...`));
            }

            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, delayMs));

            // Exponential backoff with max cap
            delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
        }
    }

    throw lastError;
}

module.exports = { withRetry };
