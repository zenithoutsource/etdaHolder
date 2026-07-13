import { resolvePresentationGatewayBaseUrl } from './presentationGatewayBaseUrl'

const ORIGINAL_GATEWAY = process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL
const ORIGINAL_VP_RELAY = process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL
const ORIGINAL_WALLET_API = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL

afterEach(() => {
  if (ORIGINAL_GATEWAY === undefined) {
    delete process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL = ORIGINAL_GATEWAY
  }
  if (ORIGINAL_VP_RELAY === undefined) {
    delete process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL = ORIGINAL_VP_RELAY
  }
  if (ORIGINAL_WALLET_API === undefined) {
    delete process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = ORIGINAL_WALLET_API
  }
})

test('prefers EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL override', () => {
  process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL = 'http://10.0.0.9:4000/'
  expect(resolvePresentationGatewayBaseUrl()).toBe('http://10.0.0.9:4000')
})

test('falls back to EXPO_PUBLIC_VP_RELAY_BASE_URL', () => {
  delete process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL
  process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL = 'http://10.0.0.5:4000'
  expect(resolvePresentationGatewayBaseUrl()).toBe('http://10.0.0.5:4000')
})

test('falls back to wallet-api origin strip', () => {
  delete process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL
  delete process.env.EXPO_PUBLIC_VP_RELAY_BASE_URL
  process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'http://192.168.1.10:4000/wallet-api'
  expect(resolvePresentationGatewayBaseUrl()).toBe('http://192.168.1.10:4000')
})
