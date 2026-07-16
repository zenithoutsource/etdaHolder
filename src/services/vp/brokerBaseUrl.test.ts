import { resolveBrokerBaseUrl } from './brokerBaseUrl'

const ORIGINAL = process.env.EXPO_PUBLIC_BROKER_BASE_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  else process.env.EXPO_PUBLIC_BROKER_BASE_URL = ORIGINAL
})

test('defaults to LAN broker host', () => {
  delete process.env.EXPO_PUBLIC_BROKER_BASE_URL
  expect(resolveBrokerBaseUrl()).toBe('http://192.100.10.49')
})

test('trims trailing slash from override', () => {
  process.env.EXPO_PUBLIC_BROKER_BASE_URL = 'http://192.100.10.49/'
  expect(resolveBrokerBaseUrl()).toBe('http://192.100.10.49')
})
