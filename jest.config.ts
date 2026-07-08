import type { Config } from 'jest'

const config: Config = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
    '<rootDir>/scripts/**/*.test.js',
  ],
  moduleNameMapper: {
    '^react-native-mmkv$': '<rootDir>/src/__mocks__/react-native-mmkv.ts',
    '^react-native-quick-crypto$': '<rootDir>/src/__mocks__/react-native-quick-crypto.ts',
    '^react-native-keychain$': '<rootDir>/src/__mocks__/react-native-keychain.ts',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/sdk/**',
    '!src/__mocks__/**',
    '!src/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|sentry-expo|native-base|@sphereon/.*|@craftzdog/.*|@noble/.*|uuid)',
  ],
}

export default config
