import {
  installWalletApiFetch,
  isWalletApiFetchInput,
  normalizeWalletApiBaseUrl,
  resolveNativeDevLoopbackBaseUrl,
  resolveWalletApiUrl,
} from './installWalletApiFetch'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

describe('wallet API fetch installer', () => {
  const realFetch = globalThis.fetch
  const originalEnv = process.env
  const logWalletErrorMock = logWalletError as jest.MockedFunction<typeof logWalletError>
  const logWalletStepMock = logWalletStep as jest.MockedFunction<typeof logWalletStep>

  afterEach(() => {
    globalThis.fetch = realFetch
    process.env = { ...originalEnv }
    logWalletErrorMock.mockClear()
    logWalletStepMock.mockClear()
  })

  test('normalizes trailing slash from base URL', () => {
    expect(normalizeWalletApiBaseUrl('http://localhost:3001/')).toBe('http://localhost:3001')
  })

  test('rewrites development loopback backend URLs to the Metro host', () => {
    expect(
      resolveNativeDevLoopbackBaseUrl('http://127.0.0.1:4000', '172.18.2.125:8081', true),
    ).toBe('http://172.18.2.125:4000')
  })

  test('keeps explicit non-loopback backend URLs unchanged', () => {
    expect(
      resolveNativeDevLoopbackBaseUrl('http://172.18.2.125:4000', '172.18.2.125:8081', true),
    ).toBe('http://172.18.2.125:4000')
  })

  test('keeps loopback backend URLs outside development', () => {
    expect(
      resolveNativeDevLoopbackBaseUrl('http://127.0.0.1:4000', '172.18.2.125:8081', false),
    ).toBe('http://127.0.0.1:4000')
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

  test('identifies generated wallet API paths only', () => {
    expect(isWalletApiFetchInput('/wallet-api/auth/login')).toBe(true)
    expect(isWalletApiFetchInput('https://exp.host/--/api/v2/push/updateDeviceToken')).toBe(false)
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

  test('patched fetch sends issuer calls to the original public URL', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => new Response('{}'))

    installWalletApiFetch({
      baseUrl: 'http://127.0.0.1:4000',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await fetch('https://issuer.office.example/credential', { method: 'POST', body: '{}' })

    expect(fetchMock).toHaveBeenCalledWith('https://issuer.office.example/credential', {
      method: 'POST',
      body: '{}',
    })
  })

  test('patched fetch sends verifier calls to the original public URL', async () => {
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => new Response('{}'))

    installWalletApiFetch({
      baseUrl: 'http://127.0.0.1:4000',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await fetch('http://verifier.zenithcomp.co.th:455/openid4vc/request/request-1')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://verifier.zenithcomp.co.th:455/openid4vc/request/request-1',
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

  test('does not log Expo push aborts as wallet SDK fetch failures', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => {
      throw abortError
    })

    installWalletApiFetch({
      baseUrl: 'http://localhost:3001',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await expect(
      fetch('https://exp.host/--/api/v2/push/updateDeviceToken', { method: 'POST' }),
    ).rejects.toBe(abortError)

    expect(logWalletErrorMock).not.toHaveBeenCalled()
    expect(logWalletStepMock).not.toHaveBeenCalled()
  })

  test('logs wallet API AbortError as fetch-aborted, not fetch-failed', async () => {
    const abortError = new Error('Aborted')
    abortError.name = 'AbortError'
    const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(async () => {
      throw abortError
    })

    installWalletApiFetch({
      baseUrl: 'http://localhost:3001',
      fetchImpl: fetchMock as unknown as typeof fetch,
    })

    await expect(fetch('/wallet-api/auth/login', { method: 'POST' })).rejects.toBe(abortError)

    expect(logWalletErrorMock).not.toHaveBeenCalled()
    expect(logWalletStepMock).toHaveBeenCalledWith(
      'sdk',
      'fetch-aborted',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
