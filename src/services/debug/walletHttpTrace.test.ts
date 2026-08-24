import {
  resolveHttpTraceScope,
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
