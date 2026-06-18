import {
  isWalletDebugLoggingEnabled,
  logWalletError,
  logWalletStep,
  sanitizeForWalletLog,
} from './walletLogger'

describe('walletLogger', () => {
  const originalInfo = console.info
  const originalError = console.error
  const originalFlag = process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS

  beforeEach(() => {
    console.info = jest.fn()
    console.error = jest.fn()
  })

  afterEach(() => {
    console.info = originalInfo
    console.error = originalError
    process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS = originalFlag
  })

  test('enables operational logs in development unless explicitly disabled', () => {
    delete process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS

    expect(isWalletDebugLoggingEnabled(true)).toBe(true)

    process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS = 'false'
    expect(isWalletDebugLoggingEnabled(true)).toBe(false)
  })

  test('keeps operational logs disabled outside development', () => {
    process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS = 'true'

    expect(isWalletDebugLoggingEnabled(false)).toBe(false)
  })

  test('redacts tokens, VC/VP payloads, claims, and PII-like fields', () => {
    const sanitized = sanitizeForWalletLog({
      endpoint: 'https://issuer.example.com/credential',
      accessToken: 'access-token',
      rawVc: 'issuer.vc.jwt',
      vpToken: 'vp.jwt',
      email: 'alice@example.com',
      password: 'passw0rd',
      Authorization: 'Bearer token',
      host: 'issuer.example.com',
      credentialSubject: { full_name: 'Alice', id_number: '1234' },
      safe: { status: 201, alg: 'EdDSA', kid: 'did:key:z6Mk#z6Mk' },
    })

    expect(sanitized).toEqual({
      endpoint: 'https://issuer.example.com/credential',
      accessToken: '[redacted]',
      rawVc: '[redacted]',
      vpToken: '[redacted]',
      email: '[redacted]',
      password: '[redacted]',
      Authorization: '[redacted]',
      host: 'issuer.example.com',
      credentialSubject: '[redacted]',
      safe: { status: 201, alg: 'EdDSA', kid: 'did:key:z6Mk#z6Mk' },
    })
  })

  test('logs flow steps with scoped tags and sanitized metadata', () => {
    logWalletStep('oid4vci', 'credential-request', {
      endpoint: 'https://issuer.example.com/credential',
      proof: 'proof.jwt',
      format: 'dc+sd-jwt',
    })

    expect(console.info).toHaveBeenCalledWith('[wallet:oid4vci] credential-request', {
      endpoint: 'https://issuer.example.com/credential',
      proof: '[redacted]',
      format: 'dc+sd-jwt',
    })
  })

  test('logs raw errors with sanitized context', () => {
    const error = Object.assign(new Error('Present VP is invalid'), { code: 'VerifierRejected' })

    logWalletError('oid4vp', 'submit-failed', error, {
      vpToken: 'vp.jwt',
      responseStatus: 400,
    })

    expect(console.error).toHaveBeenCalledWith(
      '[wallet:oid4vp] submit-failed',
      { responseStatus: 400, vpToken: '[redacted]' },
      { code: 'VerifierRejected', message: 'Present VP is invalid', name: 'Error' },
    )
  })
})
