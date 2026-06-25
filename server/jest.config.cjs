module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/mdoc-issuer/**/*.test.ts'],
  clearMocks: true,
}
