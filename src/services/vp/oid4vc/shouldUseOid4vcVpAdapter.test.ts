import { shouldUseOid4vcVpAdapter } from './shouldUseOid4vcVpAdapter'

describe('shouldUseOid4vcVpAdapter', () => {
  const dcqlRequest = {
    client_id: 'redirect_uri:http://verifier.example/openid4vc/verify/session',
    response_uri: 'http://verifier.example/openid4vc/verify/session',
    response_mode: 'direct_post',
    dcql_query: {
      credentials: [{ id: 'idcard_credential', format: 'jwt_vc_json' }],
    },
  }

  it('returns false for my-qr even when flag is on', () => {
    expect(
      shouldUseOid4vcVpAdapter({
        flagEnabled: true,
        presentationFlowOrigin: 'my-qr',
        authorizationRequest: dcqlRequest,
      }),
    ).toBe(false)
  })

  it('returns false for scan when flag is off', () => {
    expect(
      shouldUseOid4vcVpAdapter({
        flagEnabled: false,
        presentationFlowOrigin: 'scan',
        authorizationRequest: dcqlRequest,
      }),
    ).toBe(false)
  })

  it('returns true for scan + flag on + DCQL + direct_post', () => {
    expect(
      shouldUseOid4vcVpAdapter({
        flagEnabled: true,
        presentationFlowOrigin: 'scan',
        authorizationRequest: dcqlRequest,
      }),
    ).toBe(true)
  })

  it('returns false for string dcql_query dual-format after normalization', () => {
    expect(
      shouldUseOid4vcVpAdapter({
        flagEnabled: true,
        presentationFlowOrigin: 'scan',
        authorizationRequest: {
          ...dcqlRequest,
          dcql_query: JSON.stringify({
            credentials: [
              { id: 'sd_jwt_cred', format: 'dc+sd-jwt' },
              { id: 'mdoc_cred', format: 'mso_mdoc' },
            ],
          }),
        },
      }),
    ).toBe(false)
  })

  it('returns true for scan + flag on + DCQL + direct_post.jwt', () => {
    expect(
      shouldUseOid4vcVpAdapter({
        flagEnabled: true,
        presentationFlowOrigin: 'scan',
        authorizationRequest: {
          ...dcqlRequest,
          response_mode: 'direct_post.jwt',
        },
      }),
    ).toBe(true)
  })

  it('returns false for Presentation Exchange', () => {
    expect(
      shouldUseOid4vcVpAdapter({
        flagEnabled: true,
        presentationFlowOrigin: 'scan',
        authorizationRequest: {
          client_id: 'did:web:verifier.example.com',
          response_uri: 'https://verifier.example.com/oid4vp/direct-post',
          response_mode: 'direct_post',
          presentation_definition: JSON.stringify({ id: 'pex', input_descriptors: [] }),
        },
      }),
    ).toBe(false)
  })

  it('returns false for issuer OID4VP client_id', () => {
    expect(
      shouldUseOid4vcVpAdapter({
        flagEnabled: true,
        presentationFlowOrigin: 'same-device',
        authorizationRequest: {
          client_id: 'decentralized_identifier:did:web:issuer.example.com',
          response_uri: 'https://issuer.example.com/oid4vp/direct-post',
          response_mode: 'direct_post',
          dcql_query: { credentials: [{ id: 'pid_credential', format: 'jwt_vc_json' }] },
        },
        env: {
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID:
            'decentralized_identifier:did:web:issuer.example.com',
          EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN: 'https://issuer.example.com',
        },
      }),
    ).toBe(false)
  })
})
