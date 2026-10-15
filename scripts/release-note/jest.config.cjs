const path = require('node:path');

module.exports = {
  rootDir: path.resolve(__dirname),
  testEnvironment: 'node',
  testMatch: ['**/*.spec.mjs'],
  transform: {},
  testTimeout: 20000,
};
