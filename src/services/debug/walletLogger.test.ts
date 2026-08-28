import {
  isWalletDebugLoggingEnabled,
  isWalletRawProtocolLoggingEnabled,
  logWalletError,
  logWalletRawProtocol,
  logWalletStep,
  readWalletDebugMaxBodyBytes,
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

describe('walletLogger raw protocol mode', () => {
  const originalInfo = console.info
  const originalRaw = process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL
  const originalMax = process.env.EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES
  const originalDebugFlag = process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS

  beforeEach(() => {
    console.info = jest.fn()
    delete process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS
  })

  afterEach(() => {
    console.info = originalInfo
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = originalRaw
    process.env.EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES = originalMax
    process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS = originalDebugFlag
  })

  test('raw protocol mode is off unless explicitly enabled in development', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL
    expect(isWalletRawProtocolLoggingEnabled(true)).toBe(false)
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    expect(isWalletRawProtocolLoggingEnabled(true)).toBe(true)
    expect(isWalletRawProtocolLoggingEnabled(false)).toBe(false)
  })

  test('raw protocol mode requires master debug logging switch', () => {
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    process.env.EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS = 'false'
    expect(isWalletRawProtocolLoggingEnabled(true)).toBe(false)
  })

  test('sanitizeForWalletLog still redacts outside development even when raw flag is set', () => {
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signaturepart'
    expect(sanitizeForWalletLog({ rawVc: jwt }, false)).toEqual({ rawVc: '[redacted]' })
  })

  test('sanitizeForWalletLog still redacts authorization in raw mode', () => {
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    expect(sanitizeForWalletLog({ authorization: 'Bearer secret', rawVc: 'vc' }, true)).toEqual({
      authorization: '[redacted]',
      rawVc: 'vc',
    })
  })

  test('sanitizeForWalletLog preserves compact JWT strings in raw mode', () => {
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signaturepart'
    expect(sanitizeForWalletLog(jwt, true)).toBe(jwt)
  })

  test('sanitizeForWalletLog preserves rawVc when raw mode is on', () => {
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature'
    expect(sanitizeForWalletLog({ rawVc: jwt }, true)).toEqual({ rawVc: jwt })
  })

  test('sanitizeForWalletLog still redacts rawVc when raw mode is off', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL
    const jwt = 'eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signaturepart'
    expect(sanitizeForWalletLog({ rawVc: jwt }, true)).toEqual({ rawVc: '[redacted]' })
  })

  test('readWalletDebugMaxBodyBytes defaults to 32768', () => {
    process.env.EXPO_PUBLIC_WALLET_DEBUG_MAX_BODY_BYTES = '64'
    expect(readWalletDebugMaxBodyBytes()).toBe(32768)
  })

  test('logWalletRawProtocol emits only when raw mode enabled', () => {
    delete process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL
    logWalletRawProtocol('oid4vci', 'debug-raw-credential-received', { rawVc: 'x' })
    expect(console.info).not.toHaveBeenCalled()
    process.env.EXPO_PUBLIC_WALLET_DEBUG_RAW_PROTOCOL = 'true'
    logWalletRawProtocol('oid4vci', 'debug-raw-credential-received', { rawVc: 'x' })
    expect(console.info).toHaveBeenCalledWith(
      '[wallet:oid4vci] debug-raw-credential-received',
      { rawVc: 'x' },
    )
  })
})
