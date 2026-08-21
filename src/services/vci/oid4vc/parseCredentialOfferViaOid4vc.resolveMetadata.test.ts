import { Openid4vciVersion, type IssuerMetadataResult } from '@openid4vc/openid4vci'

import { resolveIssuerMetadataViaOid4vc } from './parseCredentialOfferViaOid4vc'

const mockResolveIssuerMetadata = jest.fn()

jest.mock('./createOid4vcVciClient', () => ({
  createOid4vcVciClient: () => ({
    resolveIssuerMetadata: (...args: unknown[]) => mockResolveIssuerMetadata(...args),
  }),
}))

const SESSION_ISSUER =
  'https://issuer.example/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/tenant/session'

function originMetadataResult(): IssuerMetadataResult {
  return {
    originalDraftVersion: Openid4vciVersion.V1,
    credentialIssuer: {
      credential_issuer: 'https://issuer.example',
      credential_endpoint: 'https://issuer.example/credential',
      credential_configurations_supported: {
        ThaiNationalID: { format: 'dc+sd-jwt' },
      },
    },
    authorizationServers: [
      {
        issuer: 'https://issuer.example',
        token_endpoint: 'https://issuer.example/token',
      },
    ],
    knownCredentialConfigurations: {
      ThaiNationalID: { format: 'dc+sd-jwt' },
    } as unknown as IssuerMetadataResult['knownCredentialConfigurations'],
  }
}

describe('resolveIssuerMetadataViaOid4vc', () => {
  const missingAsFetch = jest.fn(async () => new Response('missing', { status: 404 })) as unknown as typeof fetch

  beforeEach(() => {
    mockResolveIssuerMetadata.mockReset()
    ;(missingAsFetch as unknown as jest.Mock).mockClear()
  })

  test('walks path identifiers then accepts origin metadata', async () => {
    mockResolveIssuerMetadata.mockImplementation(async (identifier: string) => {
      if (identifier === 'https://issuer.example') return originMetadataResult()
      throw new Error("Fetching well known metadata resulted in an unsuccessful response with status '404'")
    })

    const { issuerMetadataResult } = await resolveIssuerMetadataViaOid4vc(SESSION_ISSUER, {
      fetchImpl: missingAsFetch,
    })
    expect(issuerMetadataResult.credentialIssuer.credential_issuer).toBe('https://issuer.example')
    expect(mockResolveIssuerMetadata).toHaveBeenCalledWith(SESSION_ISSUER)
    expect(mockResolveIssuerMetadata).toHaveBeenCalledWith('https://issuer.example')
  })

  test('overlays session-path authorization server token endpoint onto origin issuer metadata', async () => {
    mockResolveIssuerMetadata.mockResolvedValue(originMetadataResult())
    const sessionToken = 'https://issuer.example/ssi/openid4vci/final-1.0/org/token'
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/.well-known/oauth-authorization-server/') && url.endsWith('/tenant/session')) {
        return new Response(
          JSON.stringify({
            issuer: SESSION_ISSUER,
            token_endpoint: sessionToken,
            token_endpoint_auth_methods_supported: ['none'],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response('missing', { status: 404 })
    }) as unknown as typeof fetch

    const { issuerMetadataResult } = await resolveIssuerMetadataViaOid4vc(SESSION_ISSUER, { fetchImpl })
    expect(issuerMetadataResult.authorizationServers[0]?.token_endpoint).toBe(sessionToken)
    expect(issuerMetadataResult.credentialIssuer.authorization_servers).toEqual([SESSION_ISSUER])
  })

  test('ignores metadata whose credential_issuer is a different host', async () => {
    mockResolveIssuerMetadata.mockResolvedValue({
      ...originMetadataResult(),
      credentialIssuer: {
        credential_issuer: 'https://evil.example',
        credential_endpoint: 'https://evil.example/credential',
        credential_configurations_supported: {},
      },
    })

    await expect(
      resolveIssuerMetadataViaOid4vc(SESSION_ISSUER, { fetchImpl: missingAsFetch }),
    ).rejects.toThrow(
      'IssuerMetadataMismatch: credential_issuer does not match the credential offer issuer',
    )
  })

  test('maps HTTP discovery failures without wrapping them as a generic fetch error first', async () => {
    mockResolveIssuerMetadata.mockRejectedValue(
      new Error("Fetching well known metadata resulted in an unsuccessful response with status '406'"),
    )

    await expect(
      resolveIssuerMetadataViaOid4vc('https://issuer.example', { fetchImpl: missingAsFetch }),
    ).rejects.toThrow(
      /^IssuerMetadataFetchFailed:/,
    )
  })
})
