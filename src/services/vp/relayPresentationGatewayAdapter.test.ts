import { createRelayPresentationGatewayAdapter } from './relayPresentationGatewayAdapter'

const fetchMock = jest.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  jest.clearAllMocks()
})

test('createSession posts to v1 presentation-sessions', async () => {
  const client = createRelayPresentationGatewayAdapter('http://localhost:4000')
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 201,
    json: async () => ({
      sessionId: 's1',
      nonce: 'n'.repeat(64),
      expiresAt: '2026-07-09T10:05:00.000Z',
      verifyUrl: 'http://localhost:4000/v1/present/verify?s=s1',
    }),
  })

  const session = await client.createSession()
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:4000/v1/presentation-sessions',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(session.verifyUrl).toContain('/v1/present/verify')
})

test('uploadPresentation puts vp token to session', async () => {
  const client = createRelayPresentationGatewayAdapter('http://localhost:4000')
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200 })

  await client.uploadPresentation('session-1', { vpToken: 'vp~kb', credentialType: 'ThaiNationalID' })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://localhost:4000/v1/presentation-sessions/session-1',
    expect.objectContaining({ method: 'PUT' }),
  )
})

test('fetchSessionStatus reads v1 status endpoint', async () => {
  const client = createRelayPresentationGatewayAdapter('http://localhost:4000')
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ status: 'ready' }),
  })

  await expect(client.fetchSessionStatus('session-1')).resolves.toEqual({ status: 'ready' })
  expect(fetchMock).toHaveBeenCalledWith('http://localhost:4000/v1/presentation-sessions/session-1/status')
})

test('uploadPresentation maps 409 to VpSessionUploadConflict', async () => {
  const client = createRelayPresentationGatewayAdapter('http://localhost:4000')
  fetchMock.mockResolvedValueOnce({ ok: false, status: 409 })

  await expect(
    client.uploadPresentation('session-1', { vpToken: 'vp~kb', credentialType: 'ThaiNationalID' }),
  ).rejects.toThrow('VpSessionUploadConflict')
})
