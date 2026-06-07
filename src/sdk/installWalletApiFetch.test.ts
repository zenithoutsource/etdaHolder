import { installWalletApiFetch, normalizeWalletApiBaseUrl, resolveWalletApiUrl } from './installWalletApiFetch'

describe('wallet API fetch installer', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
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

  test('patched fetch prefixes generated SDK paths', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => new Response('{}'))

    installWalletApiFetch({
      baseUrl: 'http://localhost:3001',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await fetch('/wallet-api/auth/login', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/wallet-api/auth/login', { method: 'POST' })
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
