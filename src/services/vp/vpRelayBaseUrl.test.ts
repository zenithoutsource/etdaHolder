import { resolveVpRelayBaseUrl } from './vpRelayBaseUrl'

const ORIGINAL_WALLET_API = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
const ORIGINAL_VP_RELAY = process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL

afterEach(() => {
  if (ORIGINAL_WALLET_API === undefined) {
    delete process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = ORIGINAL_WALLET_API
  }
  if (ORIGINAL_VP_RELAY === undefined) {
    delete process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL = ORIGINAL_VP_RELAY
  }
})

test('strips /wallet-api suffix from configured wallet API URL', () => {
  process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'http://192.168.1.10:4000/wallet-api'
  delete process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL
  expect(resolveVpRelayBaseUrl()).toBe('http://192.168.1.10:4000')
})

test('prefers EXPO_PUBLIC_VP_RELAY_BASE_URL override', () => {
  process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL = 'http://10.0.0.5:4000'
  expect(resolveVpRelayBaseUrl()).toBe('http://10.0.0.5:4000')
})
