import {
  installWalletApiFetch,
  normalizeWalletApiBaseUrl,
  resolveDevIssuerProxyUrl,
  resolveWalletApiUrl,
} from './installWalletApiFetch'

describe('wallet API fetch installer', () => {
  const realFetch = globalThis.fetch
  const originalEnv = process.env

  afterEach(() => {
    globalThis.fetch = realFetch
    process.env = { ...originalEnv }
  })

  test('normalizes trailing slash from base URL', () => {
    expect(normalizeWalletApiBaseUrl('http://localhost:3001/')).toBe('http://localhost:3001')
  })

  test('resolves generated wallet API paths against configured backend', () => {
    expect(resolveWalletApiUrl('/wallet-api/auth/login', 'http://192.168.1.10:3001/')).toBe(
      'http://192.168.1.10:3001/wallet-api/auth/login',
    )
  })

  test('leaves non-wallet requests unchanged', () => {
    expect(resolveWalletApiUrl('https://issuer.example.com/.well-known/openid-configuration')).toBe(
      'https://issuer.example.com/.well-known/openid-configuration',
    )
  })

  test('rewrites configured issuer requests through the development issuer proxy', () => {
    expect(
      resolveDevIssuerProxyUrl('https://issuer.office.example/.well-known/openid-credential-issuer', {
        target: 'https://issuer.office.example',
        baseUrl: 'http://127.0.0.1:4000/dev-issuer-proxy',
      }),
    ).toBe('http://127.0.0.1:4000/dev-issuer-proxy/.well-known/openid-credential-issuer')
  })

  test('normalizes trailing slashes from development issuer proxy config', () => {
    expect(
      resolveDevIssuerProxyUrl('https://issuer.office.example/credential', {
        target: 'https://issuer.office.example/',
        baseUrl: 'http://127.0.0.1:4000/dev-issuer-proxy/',
      }),
    ).toBe(
      'http://127.0.0.1:4000/dev-issuer-proxy/credential',
    )
  })

  test('does not rewrite unrelated issuer requests', () => {
    expect(
      resolveDevIssuerProxyUrl('https://public-issuer.example/.well-known/openid-credential-issuer', {
        target: 'https://issuer.office.example',
        baseUrl: 'http://127.0.0.1:4000/dev-issuer-proxy',
      }),
    ).toBe(
      'https://public-issuer.example/.well-known/openid-credential-issuer'
    )
  })

  test('patched fetch prefixes generated SDK paths', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => new Response('{}'))

    installWalletApiFetch({
      baseUrl: 'http://localhost:3001',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await fetch('/wallet-api/auth/login', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/wallet-api/auth/login', { method: 'POST' })
  })

  test('patched fetch sends configured issuer calls through the development proxy', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => new Response('{}'))

    installWalletApiFetch({
      baseUrl: 'http://127.0.0.1:4000',
      fetchImpl: fetchMock as unknown as typeof fetch,
      devIssuerProxy: {
        target: 'https://issuer.office.example',
        baseUrl: 'http://127.0.0.1:4000/dev-issuer-proxy',
      },
    })

    await fetch('https://issuer.office.example/credential', { method: 'POST', body: '{}' })

    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:4000/dev-issuer-proxy/credential', {
      method: 'POST',
      body: '{}',
    })
  })

  test('patched fetch sends configured verifier calls through the development verifier proxy', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => new Response('{}'))

    installWalletApiFetch({
      baseUrl: 'http://127.0.0.1:4000',
      fetchImpl: fetchMock as unknown as typeof fetch,
      devVerifierProxy: {
        target: 'http://192.100.10.48',
        baseUrl: 'http://127.0.0.1:4000/dev-verifier-proxy',
      },
    })

    await fetch('http://192.100.10.48/openid4vc/request/request-1')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/dev-verifier-proxy/openid4vc/request/request-1',
      undefined,
    )
  })

  test('patched fetch normalizes plain text wallet API errors to JSON', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => new Response('Bad Request', { status: 400, statusText: 'Bad Request' }),
    )

    installWalletApiFetch({
      baseUrl: 'http://localhost:3001',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    const response = await fetch('/wallet-api/auth/login', { method: 'POST' })
    const body = await response.text()

    expect(response.status).toBe(400)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(body)).toEqual({ message: 'Bad Request' })
  })
})
