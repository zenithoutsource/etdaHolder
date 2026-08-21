import {
  discoverIssuerMetadata,
  issuerIdentifiersCompatible,
  listIssuerIdentifierCandidates,
  listIssuerMetadataWellKnownUrls,
  mapIssuerMetadataClientError,
} from './discoverIssuerMetadata'

const SESSION_ISSUER =
  'https://issuer.example/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/tenant/session'

describe('discoverIssuerMetadata', () => {
  test('lists identifier candidates from session path down to origin', () => {
    expect(listIssuerIdentifierCandidates(SESSION_ISSUER)).toEqual([
      SESSION_ISSUER,
      'https://issuer.example/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/tenant',
      'https://issuer.example/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1',
      'https://issuer.example/ssi/openid4vci/final-1.0',
      'https://issuer.example/ssi/openid4vci',
      'https://issuer.example/ssi',
      'https://issuer.example',
    ])
  })

  test('builds RFC 8414 and suffix well-known URLs', () => {
    expect(listIssuerMetadataWellKnownUrls('https://issuer.example/tenant')).toEqual([
      'https://issuer.example/.well-known/openid-credential-issuer/tenant',
      'https://issuer.example/tenant/.well-known/openid-credential-issuer',
    ])
    expect(listIssuerMetadataWellKnownUrls('https://issuer.example')).toEqual([
      'https://issuer.example/.well-known/openid-credential-issuer',
    ])
  })

  test('accepts same-origin prefix metadata issuers and rejects other hosts', () => {
    expect(issuerIdentifiersCompatible(SESSION_ISSUER, 'https://issuer.example')).toBe(true)
    expect(
      issuerIdentifiersCompatible(
        SESSION_ISSUER,
        'https://issuer.example/ssi/openid4vci/final-1.0',
      ),
    ).toBe(true)
    expect(issuerIdentifiersCompatible(SESSION_ISSUER, SESSION_ISSUER)).toBe(true)
    expect(issuerIdentifiersCompatible(SESSION_ISSUER, 'https://evil.example')).toBe(false)
    expect(issuerIdentifiersCompatible('https://issuer.example', 'http://issuer.example')).toBe(
      false,
    )
  })

  test('walks 404 path well-known URLs then returns origin metadata', async () => {
    const originMetadata = {
      credential_issuer: 'https://issuer.example',
      credential_endpoint: 'https://issuer.example/credential',
      credential_configurations_supported: {
        ThaiNationalID: { format: 'dc+sd-jwt' },
      },
    }
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://issuer.example/.well-known/openid-credential-issuer') {
        return new Response(JSON.stringify(originMetadata), { status: 200 })
      }
      return new Response('missing', { status: 404 })
    }) as unknown as typeof fetch

    await expect(discoverIssuerMetadata(SESSION_ISSUER, fetchImpl)).resolves.toEqual(originMetadata)
    expect(fetchImpl).toHaveBeenCalled()
  })

  test('does not use metadata from a different host', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        JSON.stringify({
          credential_issuer: 'https://evil.example',
          credential_endpoint: 'https://evil.example/credential',
          credential_configurations_supported: {},
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    await expect(discoverIssuerMetadata(SESSION_ISSUER, fetchImpl)).rejects.toThrow(
      'IssuerMetadataMismatch: credential_issuer does not match the credential offer issuer',
    )
  })

  test('maps HTTP 406 after exhausted candidates', async () => {
    const fetchImpl = jest.fn(async () => new Response('nope', { status: 406 })) as unknown as typeof fetch
    await expect(discoverIssuerMetadata('https://issuer.example', fetchImpl)).rejects.toThrow(
      'IssuerMetadataFetchFailed: HTTP 406',
    )
  })

  test('maps library mismatch and HTTP errors without swallowing prefixes', () => {
    expect(
      mapIssuerMetadataClientError(
        new Error("The 'issuer' parameter 'https://issuer.example' does not match"),
      ).message,
    ).toMatch(/^IssuerMetadataMismatch:/)
    expect(
      mapIssuerMetadataClientError(
        new Error("Fetching well known metadata resulted in an unsuccessful response with status '404'"),
      ).message,
    ).toMatch(/^IssuerMetadataFetchFailed:/)
    expect(mapIssuerMetadataClientError(new TypeError('Network request failed')).message).toBe(
      'IssuerMetadataFetchFailed: Network request failed',
    )
  })
})
