import {
  buildQrUrl,
  createVpSession,
  fetchVpSessionStatus,
  isSdJwtCredential,
} from './walletInitiatedPresentation'
import { createRelayPresentationGatewayAdapter } from './relayPresentationGatewayAdapter'

jest.mock('../crypto/crypto', () => ({
  signSdJwtKbPresentationToken: jest.fn(async () => 'issuer.jwt~kb.jwt'),
}))

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

const client = createRelayPresentationGatewayAdapter('http://192.168.1.10:4000')

beforeEach(() => {
  jest.clearAllMocks()
})

test('createVpSession uses verifier presentation client', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({
      sessionId: 's1',
      nonce: 'n'.repeat(64),
      expiresAt: '2026-07-06T10:05:00.000Z',
      verifyUrl: 'http://192.168.1.10:4000/v1/present/verify?s=s1',
    }),
  })

  const session = await createVpSession(client)
  expect(fetchMock).toHaveBeenCalledWith(
    'http://192.168.1.10:4000/v1/presentation-sessions',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(session.sessionId).toBe('s1')
})

test('buildQrUrl prefers server verifyUrl', () => {
  expect(
    buildQrUrl({
      sessionId: 'abc',
      verifyUrl: 'http://localhost:4000/v1/present/verify?s=abc',
    }),
  ).toBe('http://localhost:4000/v1/present/verify?s=abc')
})

test('fetchVpSessionStatus reads verifier status', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ready' }),
  })

  await expect(fetchVpSessionStatus('session-1', client)).resolves.toEqual({ status: 'ready' })
  expect(fetchMock).toHaveBeenCalledWith('http://192.168.1.10:4000/v1/presentation-sessions/session-1/status')
})

test('fetchVpSessionStatus returns verify_failed with reason', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ status: 'verify_failed', reason: 'issuer-signature-invalid' }),
  })

  await expect(fetchVpSessionStatus('session-1', client)).resolves.toEqual({
    status: 'verify_failed',
    reason: 'issuer-signature-invalid',
  })
})

test('isSdJwtCredential detects tilde in rawVc', () => {
  expect(isSdJwtCredential({ rawVc: 'issuer.jwt~disclosure~' } as never)).toBe(true)
  expect(isSdJwtCredential({ rawVc: 'issuer.jwt' } as never)).toBe(false)
})
