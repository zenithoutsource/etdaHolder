import {
  buildQrUrl,
  createVpSession,
  isSdJwtCredential,
} from './walletInitiatedPresentation'

jest.mock('../crypto/crypto', () => ({
  signSdJwtKbPresentationToken: jest.fn(async () => 'issuer.jwt~kb.jwt'),
}))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

const ORIGINAL_WALLET_API = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL

beforeEach(() => {
  jest.clearAllMocks()
})

afterEach(() => {
  if (ORIGINAL_WALLET_API === undefined) {
    delete process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
  } else {
    process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = ORIGINAL_WALLET_API
  }
})

test('createVpSession posts to relay', async () => {
  process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'http://192.168.1.10:4000/wallet-api'
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({
      sessionId: 's1',
      nonce: 'n'.repeat(64),
      expiresAt: '2026-07-06T10:05:00.000Z',
    }),
  })

  const session = await createVpSession()
  expect(fetchMock).toHaveBeenCalledWith(
    'http://192.168.1.10:4000/dev/vp-session',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(session.sessionId).toBe('s1')
})

test('buildQrUrl encodes session id', () => {
  process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'http://localhost:4000/wallet-api'
  expect(buildQrUrl('abc')).toBe('http://localhost:4000/dev/vp-verify?s=abc')
})

test('isSdJwtCredential detects tilde separator', () => {
  expect(isSdJwtCredential({ rawVc: 'jwt~disclosure~' } as never)).toBe(true)
  expect(isSdJwtCredential({ rawVc: 'plain.jwt' } as never)).toBe(false)
})
