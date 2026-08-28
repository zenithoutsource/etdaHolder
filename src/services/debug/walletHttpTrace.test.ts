import {
  isSilentIssuerMetadataDiscoveryResponse,
  resolveHttpTraceScope,
  resetWalletHttpTraceDedupeForTesting,
  shouldCaptureSuccessBody,
  traceHttpFetch,
  truncateBodyPreview,
} from './walletHttpTrace'
import {
  isWalletRawProtocolLoggingEnabled,
  logWalletError,
  logWalletStep,
} from './walletLogger'

jest.mock('./walletLogger', () => ({
  isWalletDebugLoggingEnabled: jest.fn(() => true),
  isWalletRawProtocolLoggingEnabled: jest.fn(() => false),
  readWalletDebugMaxBodyBytes: jest.fn(() => 32),
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
  sanitizeForWalletLog: jest.fn((value: unknown) => value),
}))

describe('walletHttpTrace', () => {
  const logWalletStepMock = logWalletStep as jest.Mock
  const logWalletErrorMock = logWalletError as jest.Mock
  const isWalletRawProtocolLoggingEnabledMock = isWalletRawProtocolLoggingEnabled as jest.Mock

  beforeEach(() => {
    logWalletStepMock.mockClear()
    logWalletErrorMock.mockClear()
    isWalletRawProtocolLoggingEnabledMock.mockReturnValue(false)
    resetWalletHttpTraceDedupeForTesting()
  })

  test('isSilentIssuerMetadataDiscoveryResponse matches retryable issuer well-known GET 404', () => {
    expect(
      isSilentIssuerMetadataDiscoveryResponse(
        'https://issuer.tonyhere.work/.well-known/openid-credential-issuer/ssi/openid4vci/final-1.0',
        'GET',
        404,
      ),
    ).toBe(true)
    expect(isSilentIssuerMetadataDiscoveryResponse('/wallet-api/auth/login', 'POST', 404)).toBe(false)
  })

  test('traceHttpFetch skips http-request-start unless raw protocol mode is on', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))
    await traceHttpFetch(fetchImpl as typeof fetch, 'https://issuer.example.com/credential')
    expect(logWalletStepMock).not.toHaveBeenCalledWith('http', 'http-request-start', expect.anything())
    isWalletRawProtocolLoggingEnabledMock.mockReturnValue(true)
    await traceHttpFetch(fetchImpl as typeof fetch, 'https://issuer.example.com/credential')
    expect(logWalletStepMock).toHaveBeenCalledWith('http', 'http-request-start', expect.anything())
  })

  test('traceHttpFetch stays silent for issuer metadata discovery 404', async () => {
    const fetchImpl = jest.fn(
      async () =>
        new Response('missing', {
          status: 404,
        }),
    )
    await traceHttpFetch(
      fetchImpl as typeof fetch,
      'https://issuer.tonyhere.work/.well-known/openid-credential-issuer/ssi/openid4vci/final-1.0',
      { method: 'GET' },
    )
    expect(logWalletErrorMock).not.toHaveBeenCalled()
    expect(logWalletStepMock).not.toHaveBeenCalledWith('http', 'http-response', expect.anything())
  })

  test('traceHttpFetch stays silent for OID4VP presentation submit wire body', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))
    await traceHttpFetch(fetchImpl as typeof fetch, 'https://verifier.example/response', {
      method: 'POST',
      body: 'response=eyJhbGciOiJFQ0RILUVTIn0..cipher.tag',
    })
    expect(logWalletStepMock).not.toHaveBeenCalled()
    expect(logWalletErrorMock).not.toHaveBeenCalled()
  })

  test('traceHttpFetch dedupes identical HTTP failures within a short window', async () => {
    const fetchImpl = jest.fn(async () => new Response('{"message":"bad"}', { status: 400 }))
    await traceHttpFetch(fetchImpl as typeof fetch, '/wallet-api/auth/login', { method: 'POST' })
    await traceHttpFetch(fetchImpl as typeof fetch, '/wallet-api/auth/login', { method: 'POST' })
    expect(logWalletErrorMock).toHaveBeenCalledTimes(1)
  })

  test('resolveHttpTraceScope uses sdk for relative wallet-api paths', () => {
    expect(resolveHttpTraceScope('/wallet-api/auth/login')).toBe('sdk')
    expect(resolveHttpTraceScope('https://issuer.example.com/credential')).toBe('http')
  })

  test('truncateBodyPreview appends truncation marker', () => {
    expect(truncateBodyPreview('abcdef', 3)).toBe('abc…[truncated 3 bytes]')
  })

  test('traceHttpFetch logs error on HTTP 400 with response body', async () => {
    const fetchImpl = jest.fn(async () => new Response('{"message":"bad"}', { status: 400 }))
    const response = await traceHttpFetch(fetchImpl as typeof fetch, '/wallet-api/auth/login', { method: 'POST' })
    expect(response.status).toBe(400)
    expect(logWalletErrorMock).toHaveBeenCalledWith(
      'sdk',
      'http-response',
      expect.any(Error),
      expect.objectContaining({ status: 400, ok: false, responseBody: { message: 'bad' } }),
    )
  })

  test('traceHttpFetch logs info on HTTP 200', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 }))
    await traceHttpFetch(fetchImpl as typeof fetch, 'https://issuer.example.com/.well-known/openid-credential-issuer')
    expect(logWalletStepMock).toHaveBeenCalledWith('http', 'http-response', expect.objectContaining({ ok: true }))
    expect(logWalletErrorMock).not.toHaveBeenCalled()
  })

  test('shouldCaptureSuccessBody is true for credential path when raw mode would be on', () => {
    isWalletRawProtocolLoggingEnabledMock.mockReturnValue(true)
    expect(shouldCaptureSuccessBody('https://issuer.example.com/credential', { method: 'POST' })).toBe(true)
    expect(shouldCaptureSuccessBody('https://issuer.example.com/health', { method: 'GET' })).toBe(false)
  })
})
