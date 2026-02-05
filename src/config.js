const path = require('path');

const AUTH_FILE = path.resolve(__dirname, '../auth.json');
const EXPORT_DIR = path.resolve(__dirname, '../export');
const ONENOTE_URL = 'https://www.onenote.com/notebooks';

module.exports = {
    AUTH_FILE,
    EXPORT_DIR,
    ONENOTE_URL
};
