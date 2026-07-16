import {
  normalizeBrokerPresentationRequest,
  createBrokerSessionClient,
  BrokerPresentationRequestInvalid,
} from './brokerSessionClient'

test('normalize returns openid4vp string', () => {
  expect(
    normalizeBrokerPresentationRequest('openid4vp://authorize?client_id=x&request_uri=http://v/r/1'),
  ).toContain('openid4vp://')
})

test('normalize returns https url with response_type=vp_token', () => {
  expect(
    normalizeBrokerPresentationRequest('  https://verifier.example/authorize?response_type=vp_token  '),
  ).toBe('https://verifier.example/authorize?response_type=vp_token')
})

test('normalize returns request_uri from JSON', () => {
  expect(
    normalizeBrokerPresentationRequest({ request_uri: 'http://192.100.10.48/openid4vc/request/abc' }),
  ).toBe('http://192.100.10.48/openid4vc/request/abc')
})

test('normalize returns null when pending', () => {
  expect(normalizeBrokerPresentationRequest({ status: 'pending' })).toBeNull()
  expect(normalizeBrokerPresentationRequest(null)).toBeNull()
})

test('normalize returns null for empty object', () => {
  expect(normalizeBrokerPresentationRequest({})).toBeNull()
})

describe('rule 3: authorization_request / qr / openid4vp keys', () => {
  test('normalize returns authorization_request string field', () => {
    expect(
      normalizeBrokerPresentationRequest({ authorization_request: 'openid4vp://authorize?client_id=y' }),
    ).toBe('openid4vp://authorize?client_id=y')
  })

  test('normalize returns qr string field', () => {
    expect(
      normalizeBrokerPresentationRequest({ qr: 'http://192.100.10.48/openid4vc/request/qr1' }),
    ).toBe('http://192.100.10.48/openid4vc/request/qr1')
  })

  test('normalize returns openid4vp string field', () => {
    expect(
      normalizeBrokerPresentationRequest({ openid4vp: 'openid4vp://authorize?client_id=z' }),
    ).toBe('openid4vp://authorize?client_id=z')
  })
})

describe('rule 5: invalid request bodies throw BrokerPresentationRequestInvalid', () => {
  test('throws for a plain non-matching string', () => {
    expect(() => normalizeBrokerPresentationRequest('not-a-request-uri')).toThrow(
      BrokerPresentationRequestInvalid,
    )
  })

  test('throws for an object with no recognized field', () => {
    expect(() => normalizeBrokerPresentationRequest({ foo: 'bar' })).toThrow(
      BrokerPresentationRequestInvalid,
    )
  })

  test('throws for a number body', () => {
    expect(() => normalizeBrokerPresentationRequest(42)).toThrow(BrokerPresentationRequestInvalid)
  })

  test('throws for an object with a non-string request_uri', () => {
    expect(() => normalizeBrokerPresentationRequest({ request_uri: 123 })).toThrow(
      BrokerPresentationRequestInvalid,
    )
  })
})

test('createSession posts walletId deviceToken platform', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      session_id: 's1',
      broker_request_endpoint: 'http://192.100.10.49/broker/session/s1/request',
      expires_at: '2026-07-16T03:54:33.1725204+00:00',
      qr_payload: 'http://192.100.10.49/broker/session/s1/request',
    }),
  })
  const client = createBrokerSessionClient('http://192.100.10.49', fetchMock as unknown as typeof fetch)
  const session = await client.createSession({
    walletId: 'w1',
    deviceToken: 'ExponentPushToken[x]',
    platform: 'android',
  })
  expect(fetchMock).toHaveBeenCalledWith(
    'http://192.100.10.49/broker/session',
    expect.objectContaining({ method: 'POST' }),
  )
  expect(session.qr_payload).toContain('/broker/session/s1/request')
})

test('createSession throws when broker response is not ok', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 500 })
  const client = createBrokerSessionClient('http://192.100.10.49', fetchMock as unknown as typeof fetch)
  await expect(
    client.createSession({ walletId: 'w1', deviceToken: 't', platform: 'ios' }),
  ).rejects.toThrow('BrokerSessionCreateFailed:500')
})

test('fetchPresentationRequest returns null while pending', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ status: 'pending' }),
    text: async () => JSON.stringify({ status: 'pending' }),
  })
  const client = createBrokerSessionClient('http://192.100.10.49', fetchMock as unknown as typeof fetch)
  await expect(client.fetchPresentationRequestUri('s1')).resolves.toBeNull()
})

test('fetchPresentationRequest returns null on 404', async () => {
  const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 })
  const client = createBrokerSessionClient('http://192.100.10.49', fetchMock as unknown as typeof fetch)
  await expect(client.fetchPresentationRequestUri('s1')).resolves.toBeNull()
})

test('fetchPresentationRequest returns the request_uri once deposited', async () => {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ request_uri: 'http://192.100.10.48/openid4vc/request/abc' }),
  })
  const client = createBrokerSessionClient('http://192.100.10.49', fetchMock as unknown as typeof fetch)
  await expect(client.fetchPresentationRequestUri('s1')).resolves.toBe(
    'http://192.100.10.48/openid4vc/request/abc',
  )
  expect(fetchMock).toHaveBeenCalledWith('http://192.100.10.49/broker/session/s1/request')
})
