module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/../lambda'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
};
