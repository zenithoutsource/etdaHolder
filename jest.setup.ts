import '@testing-library/jest-native/extend-expect'

beforeEach(() => {
  process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
})
