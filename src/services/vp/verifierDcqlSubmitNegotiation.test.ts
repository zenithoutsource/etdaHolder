import {
  buildDcqlVpTokenShapeAttemptOrder,
  buildVerifierInteropCacheKey,
  isRetryableDcqlVpTokenShapeError,
  readVerifierDcqlVpTokenShapeEnvOverride,
  resolveDcqlVpTokenShapeForPresentation,
  resolveDcqlVpTokenShapeForSubmit,
  writeCachedVerifierDcqlVpTokenShape,
} from './verifierDcqlSubmitNegotiation'

describe('verifierDcqlSubmitNegotiation', () => {
  test('buildVerifierInteropCacheKey scopes by origin and client_id scheme', () => {
    expect(
      buildVerifierInteropCacheKey(
        'x509_hash:abc',
        'https://playground.animo.id/oid4vp/session/1',
      ),
    ).toBe('playground.animo.id|x509_hash')
  })

  test('orders cached shape first then verifier hint then spec defaults', () => {
    expect(
      buildDcqlVpTokenShapeAttemptOrder({
        cachedShape: 'raw',
        verifierHint: 'object_string',
        dcqlCredentialCount: 1,
      }),
    ).toEqual(['raw', 'object_string', 'object_array'])
  })

  test('omits raw when multiple DCQL credentials are requested', () => {
    expect(
      buildDcqlVpTokenShapeAttemptOrder({
        dcqlCredentialCount: 2,
      }),
    ).toEqual(['object_array', 'object_string'])
  })

  test('uses env override as the only attempt when explicitly configured', () => {
    expect(
      buildDcqlVpTokenShapeAttemptOrder({
        envOverride: 'raw',
        dcqlCredentialCount: 1,
        cachedShape: 'object_string',
      }),
    ).toEqual(['raw'])
  })

  test('resolveDcqlVpTokenShapeForSubmit defaults to object_array without cache or hint', () => {
    expect(
      resolveDcqlVpTokenShapeForSubmit({
        cacheKey: 'example.com|redirect_uri',
        dcqlCredentialCount: 1,
      }),
    ).toBe('object_array')
  })

  test('resolveDcqlVpTokenShapeForSubmit keeps object_array for Animo playground without cache', () => {
    expect(
      resolveDcqlVpTokenShapeForSubmit({
        cacheKey: 'playground.animo.id|x509_hash',
        dcqlCredentialCount: 1,
      }),
    ).toBe('object_array')
  })

  test('resolveDcqlVpTokenShapeForPresentation returns env source when override set', () => {
    const resolved = resolveDcqlVpTokenShapeForPresentation({
      clientId: 'redirect_uri:https://example.com/cb',
      responseUri: 'https://example.com/oid4vp/session/1',
      dcqlCredentialCount: 1,
      envOverride: 'raw',
    })
    expect(resolved.shape).toBe('raw')
    expect(resolved.source).toBe('env')
    expect(resolved.cacheKey).toBe('example.com|redirect_uri')
  })

  test('resolveDcqlVpTokenShapeForPresentation prefers cached shape over default', () => {
    const cacheKey = 'example.com|redirect_uri'
    writeCachedVerifierDcqlVpTokenShape(cacheKey, 'object_string')
    const resolved = resolveDcqlVpTokenShapeForPresentation({
      clientId: 'redirect_uri:https://example.com/cb',
      responseUri: 'https://example.com/oid4vp/session/1',
      dcqlCredentialCount: 1,
    })
    expect(resolved.shape).toBe('object_string')
    expect(resolved.source).toBe('cached')
  })

  test('resolveDcqlVpTokenShapeForPresentation defaults to object_array for Animo playground', () => {
    const resolved = resolveDcqlVpTokenShapeForPresentation({
      clientId: 'x509_hash:abc',
      responseUri: 'https://playground.animo.id/oid4vp/session/1',
      dcqlCredentialCount: 1,
    })
    expect(resolved.shape).toBe('object_array')
    expect(resolved.source).toBe('default')
    expect(resolved.cacheKey).toBe('playground.animo.id|x509_hash')
  })

  test('detects retryable presentation submission HTTP failures', () => {
    expect(isRetryableDcqlVpTokenShapeError(new Error('PresentationSubmissionFailed: HTTP 500: server_error'))).toBe(false)
    expect(isRetryableDcqlVpTokenShapeError(new Error('PresentationSubmissionFailed: HTTP 400: invalid_request - Invalid session'))).toBe(false)
    expect(isRetryableDcqlVpTokenShapeError(new Error('PresentationSubmissionFailed: HTTP 400: invalid_request'))).toBe(true)
    expect(isRetryableDcqlVpTokenShapeError(new Error('PresentationSubmissionFailed: network timeout'))).toBe(false)
    expect(isRetryableDcqlVpTokenShapeError(new Error('VerifierUntrusted'))).toBe(false)
  })

  test('readVerifierDcqlVpTokenShapeEnvOverride returns undefined when env is unset', () => {
    const original = process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
    delete process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE
    expect(readVerifierDcqlVpTokenShapeEnvOverride()).toBeUndefined()
    process.env.EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE = original
  })
})
