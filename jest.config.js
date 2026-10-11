module.exports = {
    clearMocks: true,
    moduleFileExtensions: ['js', 'ts'],
    roots: ['<rootDir>/__tests__'],
    testEnvironment: 'node',
    testMatch: ['**/*.test.ts'],
    testRunner: 'jest-circus/runner',
    transform: {
      '^.+\\.ts$': 'ts-jest'
    },
    verbose: true
  }
