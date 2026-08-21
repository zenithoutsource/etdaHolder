import { findTrustedVerifier } from './trustedVerifierMatcher'

const HTTPS_CLIENT_ID = 'redirect_uri:https://unlisted.example/oid4vp/direct-post'
const HTTPS_RESPONSE_URI = 'https://unlisted.example/oid4vp/direct-post'
const DID_WEB_CLIENT_ID = 'decentralized_identifier:did:web:unlisted.example'
const HTTP_CLIENT_ID = 'redirect_uri:http://evil.example/callback'
const HTTP_RESPONSE_URI = 'http://evil.example/callback'

describe('findTrustedVerifier', () => {
  const original = process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
    } else {
      process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = original
    }
  })

  test('rejects an unlisted verifier when the interop flag is off', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'false'
    expect(findTrustedVerifier(HTTPS_CLIENT_ID, HTTPS_RESPONSE_URI, [])).toBeUndefined()
  })

  test('trusts an unlisted HTTPS same-origin verifier when the interop flag is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(findTrustedVerifier(HTTPS_CLIENT_ID, HTTPS_RESPONSE_URI, [])).toEqual({
      clientId: HTTPS_CLIENT_ID,
      name: 'unlisted.example',
      allowedOrigins: ['https://unlisted.example'],
    })
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

  test('rejects unsupported client_id schemes even when the interop flag is on', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(
      findTrustedVerifier(
        'x509_san_dns:unlisted.example',
        HTTPS_RESPONSE_URI,
        [],
      ),
    ).toBeUndefined()
  })
})
