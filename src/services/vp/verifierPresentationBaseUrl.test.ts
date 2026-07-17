import { resolveVerifierPresentationBaseUrl } from './verifierPresentationBaseUrl'

const ORIGINAL_VERIFIER = process.env.EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL
const ORIGINAL_GATEWAY = process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL
const ORIGINAL_WALLET_API = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL

afterEach(() => {
  if (ORIGINAL_VERIFIER === undefined) {
    delete process.env.EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL = ORIGINAL_VERIFIER
  }
  if (ORIGINAL_GATEWAY === undefined) {
    delete process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL = ORIGINAL_GATEWAY
  }
  if (ORIGINAL_WALLET_API === undefined) {
    delete process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = ORIGINAL_WALLET_API
  }
})

test('prefers EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL override', () => {
  process.env.EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL = 'https://verifier.example/'
  expect(resolveVerifierPresentationBaseUrl()).toBe('https://verifier.example')
})

test('falls back to EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL', () => {
  delete process.env.EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL
  process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL = 'http://10.0.0.9:4000/'
  expect(resolveVerifierPresentationBaseUrl()).toBe('http://10.0.0.9:4000')
})

test('falls back to wallet-api origin strip', () => {
  delete process.env.EXPO_PUBLIC_VERIFIER_PRESENTATION_BASE_URL
  delete process.env.EXPO_PUBLIC_PRESENTATION_GATEWAY_BASE_URL
  process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'http://192.168.1.10:4000/wallet-api'
  expect(resolveVerifierPresentationBaseUrl()).toBe('http://192.168.1.10:4000')
})
