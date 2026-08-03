import { resolveBrokerBaseUrl } from './brokerBaseUrl'

const ORIGINAL = process.env.EXPO_PUBLIC_BROKER_BASE_URL
const ORIGINAL_WALLET_API = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
const ORIGINAL_DEV = (global as { __DEV__?: boolean }).__DEV__

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  else process.env.EXPO_PUBLIC_BROKER_BASE_URL = ORIGINAL
  if (ORIGINAL_WALLET_API === undefined) delete process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
  else process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = ORIGINAL_WALLET_API
  ;(global as { __DEV__?: boolean }).__DEV__ = ORIGINAL_DEV
})

test('defaults to configured broker host', () => {
  delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  expect(resolveBrokerBaseUrl()).toBe('https://wallet.zenithcomp.co.th:455')
})

test('trims trailing slash from override', () => {
  process.env.EXPO_PUBLIC_BROKER_BASE_URL = 'https://wallet.zenithcomp.co.th:455/'
  expect(resolveBrokerBaseUrl()).toBe('https://wallet.zenithcomp.co.th:455')
})

test('falls back to wallet API origin in release builds', () => {
  delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'https://wallet.zenithcomp.co.th:455'
  ;(global as { __DEV__?: boolean }).__DEV__ = false

  expect(resolveBrokerBaseUrl()).toBe('https://wallet.zenithcomp.co.th:455')
})
