module.exports = {
    testEnvironment: 'node',
    cacheDirectory: '.jest-cache',
    testMatch: ['**/test/**/*.test.js'],
    collectCoverageFrom: ['src/**/*.js'],
    coveragePathIgnorePatterns: ['/node_modules/', '/test/'],
    watchman: false
};
