import { Platform } from 'react-native'
import { fetch as sslPinningFetch } from 'react-native-ssl-pinning'

import {
  createPinnedFetch,
  getPinnedCertificateNames,
  isPublicKeyPin,
  readWalletApiPinningConfig,
  usesPublicKeyPinning,
} from './walletApiCertPinning'

const sslPinningFetchMock = sslPinningFetch as jest.MockedFunction<typeof sslPinningFetch>

function mockPinnedSslResponse() {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    bodyString: '{}',
    text: async () => '{}',
  } as unknown as Awaited<ReturnType<typeof sslPinningFetch>>
}

describe('wallet API certificate pinning', () => {
  const originalPinnedCerts = process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS
  const originalPlatform = Platform.OS

  beforeEach(() => {
    if (originalPinnedCerts === undefined) {
      delete process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS
    } else {
      process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS = originalPinnedCerts
    }
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' })
    sslPinningFetchMock.mockClear()
    sslPinningFetchMock.mockResolvedValue(mockPinnedSslResponse())
  })

  afterEach(() => {
    if (originalPinnedCerts === undefined) {
      delete process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS
    } else {
      process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS = originalPinnedCerts
    }
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
  })

  test('parses comma-separated public-key pins from env', () => {
    process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS =
      'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=, sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB='

    expect(getPinnedCertificateNames()).toEqual([
      'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      'sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=',
    ])
  })

  test('normalizes bare base64 hashes to sha256/ pins', () => {
    process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS = 'Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4='

    expect(getPinnedCertificateNames()).toEqual([
      'sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4=',
    ])
  })

  test('strips surrounding quotes from env pins', () => {
    process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS =
      '"sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4="'

    expect(getPinnedCertificateNames()).toEqual([
      'sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4=',
    ])
  })
  test('detects public-key pin prefix', () => {
    expect(isPublicKeyPin('sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4=')).toBe(true)
    expect(isPublicKeyPin('wallet-api')).toBe(false)
  })

  test('requires every configured pin to use sha256/ for public-key mode', () => {
    expect(usesPublicKeyPinning(['sha256/abc='])).toBe(true)
    expect(usesPublicKeyPinning(['sha256/abc=', 'wallet-api'])).toBe(false)
    expect(usesPublicKeyPinning([])).toBe(false)
  })

  test('readWalletApiPinningConfig reports public-key mode', () => {
    process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS = 'sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4='

    expect(readWalletApiPinningConfig('https://wallet.example.com')).toEqual({
      backendBaseUrl: 'https://wallet.example.com',
      pinnedCertificates: ['sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4='],
      usesPublicKeyPinning: true,
    })
  })

  test('uses pkPinning for backend HTTPS requests when sha256 pins are configured', async () => {
    process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS = 'sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4='
    const fallbackFetch = jest.fn()
    const pinnedFetch = createPinnedFetch(fallbackFetch, 'https://wallet.example.com')

    await pinnedFetch('https://wallet.example.com/wallet-api/auth/login', { method: 'POST', body: '{}' })

    expect(sslPinningFetchMock).toHaveBeenCalledWith('https://wallet.example.com/wallet-api/auth/login', {
      method: 'POST',
      headers: undefined,
      body: '{}',
      pkPinning: true,
      sslPinning: { certs: ['sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4='] },
    })
    expect(fallbackFetch).not.toHaveBeenCalled()
  })

  test('always sets pkPinning even for legacy-looking cert resource names', async () => {
    process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS = 'wallet-api'
    const fallbackFetch = jest.fn()
    const pinnedFetch = createPinnedFetch(fallbackFetch, 'https://wallet.example.com')

    await pinnedFetch('https://wallet.example.com/wallet-api/auth/login')

    expect(sslPinningFetchMock).toHaveBeenCalledWith('https://wallet.example.com/wallet-api/auth/login', {
      method: 'GET',
      headers: undefined,
      body: undefined,
      pkPinning: true,
      sslPinning: { certs: ['wallet-api'] },
    })
  })

  test('falls through to fallback fetch for non-backend hosts', async () => {
    process.env.EXPO_PUBLIC_WALLET_API_PINNED_CERTS = 'sha256/Y5HqyCJlL1uzfx/hodI3CK4zcMJV5WdNdhS7Kmw6sA4='
    const fallbackFetch = jest.fn(async () => new Response('{}'))
    const pinnedFetch = createPinnedFetch(fallbackFetch, 'https://wallet.example.com')

    await pinnedFetch('https://issuer.example.com/credential')

    expect(fallbackFetch).toHaveBeenCalled()
    expect(sslPinningFetchMock).not.toHaveBeenCalled()
  })
})
