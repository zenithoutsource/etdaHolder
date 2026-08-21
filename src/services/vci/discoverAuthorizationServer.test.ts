import { Openid4vciVersion, type IssuerMetadataResult } from '@openid4vc/openid4vci'

import { overlayOfferAuthorizationServer } from './discoverAuthorizationServer'

const SESSION_ISSUER =
  'https://issuer.example/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/tenant/session'
const SESSION_TOKEN = 'https://issuer.example/ssi/openid4vci/final-1.0/org/token'
const ORIGIN_TOKEN = 'https://issuer.example/token'
const SESSION_AS_WELL_KNOWN =
  'https://issuer.example/.well-known/oauth-authorization-server/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/tenant/session'

function originMetadataResult(): IssuerMetadataResult {
  return {
    originalDraftVersion: Openid4vciVersion.V1,
    credentialIssuer: {
      credential_issuer: 'https://issuer.example',
      credential_endpoint: 'https://issuer.example/credential',
      authorization_servers: ['https://issuer.example'],
      credential_configurations_supported: {
        ThaiNationalID: { format: 'dc+sd-jwt' },
      },
    },
    authorizationServers: [
      {
        issuer: 'https://issuer.example',
        token_endpoint: ORIGIN_TOKEN,
        token_endpoint_auth_methods_supported: ['attest_jwt_client_auth'],
      },
    ],
    knownCredentialConfigurations: {
      ThaiNationalID: { format: 'dc+sd-jwt' },
    } as unknown as IssuerMetadataResult['knownCredentialConfigurations'],
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('overlayOfferAuthorizationServer', () => {
  test('replaces origin token endpoint with session-path AS metadata', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === SESSION_AS_WELL_KNOWN) {
        return jsonResponse({
          issuer: SESSION_ISSUER,
          token_endpoint: SESSION_TOKEN,
          token_endpoint_auth_methods_supported: ['none'],
          grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
        })
      }
      return new Response('missing', { status: 404 })
    }) as unknown as typeof fetch

    const result = await overlayOfferAuthorizationServer(
      SESSION_ISSUER,
      originMetadataResult(),
      fetchImpl,
    )

    expect(result.authorizationServers[0]?.token_endpoint).toBe(SESSION_TOKEN)
    expect(result.authorizationServers[0]?.issuer).toBe(SESSION_ISSUER)
    expect(result.credentialIssuer.authorization_servers).toEqual([SESSION_ISSUER])
    expect(result.credentialIssuer.credential_endpoint).toBe('https://issuer.example/credential')
    expect(result.credentialIssuer.nonce_endpoint).toBe(
      'https://issuer.example/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/nonce',
    )
  })

  test('overlays origin-root credential and nonce endpoints onto matching session paths', async () => {
    const matchingToken = 'https://issuer.example/ssi/openid4vci/final-1.0/session/token'
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === SESSION_AS_WELL_KNOWN) {
        return jsonResponse({
          issuer: SESSION_ISSUER,
          token_endpoint: matchingToken,
          token_endpoint_auth_methods_supported: ['none'],
        })
      }
      return new Response('missing', { status: 404 })
    }) as unknown as typeof fetch

    const origin = originMetadataResult()
    origin.credentialIssuer.nonce_endpoint = 'https://issuer.example/nonce'

    const result = await overlayOfferAuthorizationServer(SESSION_ISSUER, origin, fetchImpl)
    expect(result.credentialIssuer.credential_endpoint).toBe(
      'https://issuer.example/ssi/openid4vci/final-1.0/session/credential',
    )
    expect(result.credentialIssuer.nonce_endpoint).toBe(
      'https://issuer.example/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/nonce',
    )
  })

  test('keeps origin AS when session-path well-known is missing', async () => {
    const fetchImpl = jest.fn(async () => new Response('missing', { status: 404 })) as unknown as typeof fetch
    const origin = originMetadataResult()
    const result = await overlayOfferAuthorizationServer(SESSION_ISSUER, origin, fetchImpl)
    expect(result.authorizationServers[0]?.token_endpoint).toBe(ORIGIN_TOKEN)
    expect(result.credentialIssuer.authorization_servers).toEqual(['https://issuer.example'])
  })

  test('does not overlay a cross-origin token endpoint', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      if (String(input) === SESSION_AS_WELL_KNOWN) {
        return jsonResponse({
          issuer: SESSION_ISSUER,
          token_endpoint: 'https://evil.example/token',
        })
      }
      return new Response('missing', { status: 404 })
    }) as unknown as typeof fetch

    const result = await overlayOfferAuthorizationServer(
      SESSION_ISSUER,
      originMetadataResult(),
      fetchImpl,
    )
    expect(result.authorizationServers[0]?.token_endpoint).toBe(ORIGIN_TOKEN)
  })

  test('skips the extra fetch when the resolved AS already matches the offer issuer', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch
    const origin = originMetadataResult()
    const alreadyMatched: IssuerMetadataResult = {
      ...origin,
      authorizationServers: [
        {
          issuer: SESSION_ISSUER,
          token_endpoint: SESSION_TOKEN,
        },
      ],
    }
    const result = await overlayOfferAuthorizationServer(SESSION_ISSUER, alreadyMatched, fetchImpl)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.authorizationServers[0]?.token_endpoint).toBe(SESSION_TOKEN)
  })
})
