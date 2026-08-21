import { createWalletAttestClient, resolveWalletProviderBaseUrl } from './walletAttestClient'

const P256_JWK = {
  kty: 'EC' as const,
  crv: 'P-256' as const,
  x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
}

const ATTEST_REQUEST = {
  challengeId: 'challenge-1',
  pubKAttestJwk: P256_JWK,
  certificateChainDerBase64: ['MAMBAgME'],
  submissionIdempotencyKey: 'idem-1',
}

describe('walletAttestClient', () => {
  const originalFetch = global.fetch
  const originalProviderUrl = process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL
  const originalWalletApiUrl = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
  const originalTimeout = process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS
  const originalDev = (global as { __DEV__?: boolean }).__DEV__

  afterEach(() => {
    global.fetch = originalFetch
    if (originalProviderUrl === undefined) delete process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL
    else process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL = originalProviderUrl
    if (originalWalletApiUrl === undefined) delete process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
    else process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = originalWalletApiUrl
    if (originalTimeout === undefined) delete process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS
    else process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS = originalTimeout
    ;(global as { __DEV__?: boolean }).__DEV__ = originalDev
  })

  test('requestAttestationChallenge posts to challenge endpoint', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        challengeId: 'challenge-1',
        attestationChallengeBase64: 'AQID',
        expiresAt: '2026-08-13T00:00:00.000Z',
      }),
    })) as unknown as typeof fetch

    const client = createWalletAttestClient('http://localhost:4000')
    const result = await client.requestAttestationChallenge()

    expect(result).toEqual({
      challengeId: 'challenge-1',
      attestationChallengeBase64: 'AQID',
      expiresAt: '2026-08-13T00:00:00.000Z',
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/wallet-api/wallet-attestations/challenge',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
      }),
    )
  })

  test('requestAttestationChallenge throws WalletAttestChallengeNotFound on HTTP 404', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ message: 'Cannot POST' }),
    })) as unknown as typeof fetch

    const client = createWalletAttestClient('http://localhost:4000')
    await expect(client.requestAttestationChallenge()).rejects.toThrow('WalletAttestChallengeNotFound:404')
  })

  test('requestAttestationChallenge maps a thrown 404 response object', async () => {
    global.fetch = jest.fn(async () => {
      const error = Object.assign(new Error('pinned-fetch'), { status: 404, bodyString: '<html></html>' })
      throw error
    }) as unknown as typeof fetch

    const client = createWalletAttestClient('http://localhost:4000')
    await expect(client.requestAttestationChallenge()).rejects.toThrow('WalletAttestChallengeNotFound:404')
  })

  test('requestAttestations posts P-256 JWK, chain, and idempotency key', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        wua: 'wua.jwt.',
        wia: 'wia.jwt.',
        expiresAt: '2026-07-25T00:00:00.000Z',
      }),
    })) as unknown as typeof fetch

    const client = createWalletAttestClient('http://localhost:4000')
    const result = await client.requestAttestations(ATTEST_REQUEST)

    expect(result).toEqual({
      wua: 'wua.jwt.',
      wia: 'wia.jwt.',
      expiresAt: '2026-07-25T00:00:00.000Z',
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/wallet-api/wallet-attestations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(ATTEST_REQUEST),
      }),
    )
  })

  test('requestAttestations rejects an empty certificate chain', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch
    const client = createWalletAttestClient('http://localhost:4000')

    await expect(
      client.requestAttestations({
        ...ATTEST_REQUEST,
        certificateChainDerBase64: [],
      }),
    ).rejects.toThrow('WalletAttestChainRequired')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('requestAttestations throws on non-success response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Bad Request' }),
    })) as unknown as typeof fetch

    const client = createWalletAttestClient('http://localhost:4000')
    await expect(client.requestAttestations(ATTEST_REQUEST)).rejects.toThrow(
      'WalletAttestRequestFailed:400',
    )
  })

  test('resolveWalletProviderBaseUrl falls back to wallet API origin in release builds', () => {
    delete process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL
    process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'https://wallet.zenithcomp.co.th:455'
    ;(global as { __DEV__?: boolean }).__DEV__ = false

    expect(resolveWalletProviderBaseUrl()).toBe('https://wallet.zenithcomp.co.th:455')
  })

  test('requestAttestationChallenge maps a hung fetch to timeout', async () => {
    process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS = '20'
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }) as unknown as typeof fetch

    const client = createWalletAttestClient('http://localhost:4000')
    await expect(client.requestAttestationChallenge()).rejects.toThrow(
      'WalletAttestChallengeFailed: timeout',
    )
  })

  test('requestAttestations maps a hung fetch to timeout', async () => {
    process.env.EXPO_PUBLIC_WALLET_ATTEST_FETCH_TIMEOUT_MS = '20'
    global.fetch = jest.fn((_url: unknown, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    }) as unknown as typeof fetch

    const client = createWalletAttestClient('http://localhost:4000')
    await expect(client.requestAttestations(ATTEST_REQUEST)).rejects.toThrow(
      'WalletAttestRequestFailed: timeout',
    )
  })
})
