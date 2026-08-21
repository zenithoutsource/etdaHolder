import { fetchIssuerMetadata } from './exchangeService'

describe('fetchIssuerMetadata', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test('walks path well-known URLs then returns same-origin metadata', async () => {
    const originMetadata = {
      credential_issuer: 'https://issuer.example',
      credential_endpoint: 'https://issuer.example/credential',
      credential_configurations_supported: {
        ThaiNationalID: { format: 'dc+sd-jwt' },
      },
    }
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://issuer.example/.well-known/openid-credential-issuer') {
        return new Response(JSON.stringify(originMetadata), { status: 200 })
      }
      return new Response('missing', { status: 404 })
    }) as unknown as typeof fetch

    await expect(
      fetchIssuerMetadata(
        'https://issuer.example/ssi/openid4vci/final-1.0/OPENID4VCI_FINAL1/tenant/session',
      ),
    ).resolves.toEqual(originMetadata)
  })

  test('surfaces HTTP 406 after exhausted candidates', async () => {
    globalThis.fetch = jest.fn(async () => new Response('nope', { status: 406 })) as unknown as typeof fetch
    await expect(fetchIssuerMetadata('https://issuer.example')).rejects.toThrow(
      'IssuerMetadataFetchFailed: HTTP 406',
    )
  })
})
