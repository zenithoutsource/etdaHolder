import { resolveBrokerBaseUrl } from './brokerBaseUrl'

const ORIGINAL = process.env.EXPO_PUBLIC_BROKER_BASE_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  else process.env.EXPO_PUBLIC_BROKER_BASE_URL = ORIGINAL
})

test('defaults to configured broker host', () => {
  delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  expect(resolveBrokerBaseUrl()).toBe('https://wallet.zenithcomp.co.th:455')
})

test('trims trailing slash from override', () => {
  process.env.EXPO_PUBLIC_BROKER_BASE_URL = 'https://wallet.zenithcomp.co.th:455/'
  expect(resolveBrokerBaseUrl()).toBe('https://wallet.zenithcomp.co.th:455')
})
