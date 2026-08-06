import { createWalletAttestClient, resolveWalletProviderBaseUrl } from './walletAttestClient'

const PUB_JWK: JsonWebKey = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k',
}

describe('walletAttestClient', () => {
  const originalFetch = global.fetch
  const originalProviderUrl = process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL
  const originalWalletApiUrl = process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
  const originalDev = (global as { __DEV__?: boolean }).__DEV__

  afterEach(() => {
    global.fetch = originalFetch
    if (originalProviderUrl === undefined) delete process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL
    else process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL = originalProviderUrl
    if (originalWalletApiUrl === undefined) delete process.env.EXPO_PUBLIC_WALLET_API_BASE_URL
    else process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = originalWalletApiUrl
    ;(global as { __DEV__?: boolean }).__DEV__ = originalDev
  })

  test('requestAttestations posts JWK and parses WUA/WIA response', async () => {
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
    const result = await client.requestAttestations({ pubKAttestJwk: PUB_JWK })

    expect(result).toEqual({
      wua: 'wua.jwt.',
      wia: 'wia.jwt.',
      expiresAt: '2026-07-25T00:00:00.000Z',
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/wallet-api/wallet-attestations',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ pubKAttestJwk: PUB_JWK }),
      }),
    )
  })

  test('requestAttestations throws on non-201 response', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Bad Request' }),
    })) as unknown as typeof fetch

    const client = createWalletAttestClient('http://localhost:4000')
    await expect(client.requestAttestations({ pubKAttestJwk: PUB_JWK })).rejects.toThrow(
      'WalletAttestRequestFailed:400',
    )
  })

  test('resolveWalletProviderBaseUrl falls back to wallet API origin in release builds', () => {
    delete process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL
    process.env.EXPO_PUBLIC_WALLET_API_BASE_URL = 'https://wallet.zenithcomp.co.th:455'
    ;(global as { __DEV__?: boolean }).__DEV__ = false

    expect(resolveWalletProviderBaseUrl()).toBe('https://wallet.zenithcomp.co.th:455')
  })
})
