module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testPathIgnorePatterns: ['/node_modules/'],
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
  collectCoverage: true,
  collectCoverageFrom: [
    'server.js',
    'routes/**/*.js'
  ]
};
