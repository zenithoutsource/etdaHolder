import { findTrustedVerifier, findTrustedVerifierForDcApiPlatformOrigin } from './trustedVerifierMatcher'

const HTTPS_CLIENT_ID = 'redirect_uri:https://unlisted.example/oid4vp/direct-post'
const HTTPS_RESPONSE_URI = 'https://unlisted.example/oid4vp/direct-post'
const DID_WEB_CLIENT_ID = 'decentralized_identifier:did:web:unlisted.example'
const HTTP_CLIENT_ID = 'redirect_uri:http://evil.example/callback'
const HTTP_RESPONSE_URI = 'http://evil.example/callback'

describe('findTrustedVerifier', () => {
  const originalPeer = process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
  const originalVerifier = process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER
  const originalDemo = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

  afterEach(() => {
    restoreEnv('EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER', originalPeer)
    restoreEnv('EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER', originalVerifier)
    restoreEnv('EXPO_PUBLIC_WALLET_DEMO_INTEROP', originalDemo)
  })

  test('rejects an unlisted verifier when the interop flag is off', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'false'
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER
    expect(findTrustedVerifier(HTTPS_CLIENT_ID, HTTPS_RESPONSE_URI, [])).toBeUndefined()
  })

  test('trusts an unlisted HTTPS same-origin verifier when the peer flag is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(findTrustedVerifier(HTTPS_CLIENT_ID, HTTPS_RESPONSE_URI, [])).toEqual({
      clientId: HTTPS_CLIENT_ID,
      name: 'unlisted.example',
      allowedOrigins: ['https://unlisted.example'],
    })
  })

  test('trusts an unlisted HTTPS verifier when only the verifier flag is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER = 'true'
    expect(findTrustedVerifier(HTTPS_CLIENT_ID, HTTPS_RESPONSE_URI, [])).toEqual({
      clientId: HTTPS_CLIENT_ID,
      name: 'unlisted.example',
      allowedOrigins: ['https://unlisted.example'],
    })
  })

  test('trusts redirect_uri peers on the same HTTPS origin when interop is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(
      findTrustedVerifier(
        'redirect_uri:https://unlisted.example/oid4vp/client',
        'https://unlisted.example/oid4vp/direct-post',
        [],
      ),
    ).toEqual({
      clientId: 'redirect_uri:https://unlisted.example/oid4vp/client',
      name: 'unlisted.example',
      allowedOrigins: ['https://unlisted.example'],
    })
  })

  test('rejects redirect_uri peers on different origins even when interop is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(
      findTrustedVerifier(
        'redirect_uri:https://unlisted.example/oid4vp/client',
        'https://other.example/oid4vp/direct-post',
        [],
      ),
    ).toBeUndefined()
  })

  test('trusts an unlisted HTTPS did:web verifier when the interop flag is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(
      findTrustedVerifier(DID_WEB_CLIENT_ID, 'https://unlisted.example/oid4vp/direct-post', []),
    ).toEqual({
      clientId: DID_WEB_CLIENT_ID,
      name: 'unlisted.example',
      allowedOrigins: ['https://unlisted.example'],
    })
  })

  test('rejects an unlisted HTTP host even when the interop flag is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(findTrustedVerifier(HTTP_CLIENT_ID, HTTP_RESPONSE_URI, [])).toBeUndefined()
  })

  test('trusts x509_hash HTTPS peers when interop is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(
      findTrustedVerifier(
        'x509_hash:Uvo3HtuIxuhC92rShpgqcT3YXwrqRxWEviRiA0OZszk',
        'https://unlisted.example/oid4vp/direct-post',
        [],
      ),
    ).toEqual({
      clientId: 'x509_hash:Uvo3HtuIxuhC92rShpgqcT3YXwrqRxWEviRiA0OZszk',
      name: 'unlisted.example',
      allowedOrigins: ['https://unlisted.example'],
    })
  })

  test.each([
    'x509_hash:Uvo3HtuIxuhC92rShpgqcT3YXwrqRxWEviRiA0OZszk',
    'x509_san_dns:unlisted.example',
  ])('trusts %s HTTPS peers when demo interop is enabled', (clientId) => {
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(findTrustedVerifier(clientId, HTTPS_RESPONSE_URI, [])).toEqual({
      clientId,
      name: 'unlisted.example',
      allowedOrigins: ['https://unlisted.example'],
    })
  })

  test('rejects unsupported client_id schemes even when the interop flag is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(
      findTrustedVerifier(
        'verifier_attestation:unlisted.example',
        HTTPS_RESPONSE_URI,
        [],
      ),
    ).toBeUndefined()
  })

  test('findTrustedVerifierForDcApiPlatformOrigin trusts did:web on a different host than the page origin', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(
      findTrustedVerifierForDcApiPlatformOrigin(
        'decentralized_identifier:did:web:verifier.example.com',
        'https://demo.example.com',
        [],
      ),
    ).toEqual({
      clientId: 'decentralized_identifier:did:web:verifier.example.com',
      name: 'demo.example.com',
      allowedOrigins: ['https://demo.example.com'],
    })
  })
})

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}
