import { getMetaStorage } from '../storage/storage'
import {
  activateWalletCryptoV2,
  detectLegacySingleKeyWallet,
  isWalletCryptoV2Enabled,
  readCachedWalletAttestations,
} from './walletCryptoActivation'
import { WALLET_CRYPTO_V2_META_KEY } from '@/src/config/walletCryptoPolicy'

jest.mock('./credentialKeyRegistry', () => ({
  listCredentialKeyRecords: jest.fn(() => []),
}))

jest.mock('../credentials/storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('./crypto', () => ({
  hasWalletKey: jest.fn(() => false),
}))

jest.mock('./walletAttestKey', () => ({
  ensureWalletAttestKey: jest.fn(async () => ({
    holderDid: 'did:key:z6Mktest',
    publicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'apUzt87kDqiT9GpHtFV8oCSzdAe5CFqnu-XE9_DAW_k' },
  })),
}))

const mockRequestAttestations = jest.fn()

jest.mock('./walletAttestClient', () => ({
  createWalletAttestClient: jest.fn(() => ({
    requestAttestations: (...args: unknown[]) => mockRequestAttestations(...args),
  })),
}))

import { hasWalletKey } from './crypto'
import { listCredentialKeyRecords } from './credentialKeyRegistry'
import { readStoredCredentials } from '../credentials/storedCredentials'

describe('walletCryptoActivation', () => {
  beforeEach(() => {
    getMetaStorage().clearAll()
    jest.clearAllMocks()
    ;(hasWalletKey as jest.Mock).mockReturnValue(false)
    mockRequestAttestations.mockResolvedValue({
      wua: 'wua.jwt.',
      wia: 'wia.jwt.',
      expiresAt: '2026-07-25T00:00:00.000Z',
    })
  })

  test('isWalletCryptoV2Enabled is false until activation succeeds', () => {
    expect(isWalletCryptoV2Enabled()).toBe(false)
    getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')
    expect(isWalletCryptoV2Enabled()).toBe(true)
  })

  test('detectLegacySingleKeyWallet is true when v1 credentials exist without per-credential keys', () => {
    ;(hasWalletKey as jest.Mock).mockReturnValue(true)
    ;(readStoredCredentials as jest.Mock).mockReturnValue([{ id: 'cred-1' }])
    ;(listCredentialKeyRecords as jest.Mock).mockReturnValue([])
    expect(detectLegacySingleKeyWallet()).toBe(true)

    getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')
    expect(detectLegacySingleKeyWallet()).toBe(false)
  })

  test('detectLegacySingleKeyWallet is false for fresh installs without credentials', () => {
    ;(hasWalletKey as jest.Mock).mockReturnValue(true)
    ;(readStoredCredentials as jest.Mock).mockReturnValue([])
    expect(detectLegacySingleKeyWallet()).toBe(false)
  })

  test('activateWalletCryptoV2 enables v2 and caches WUA/WIA when attest succeeds', async () => {
    await activateWalletCryptoV2()

    expect(isWalletCryptoV2Enabled()).toBe(true)
    expect(readCachedWalletAttestations()).toEqual({
      wua: { value: 'wua.jwt.', expiresAt: '2026-07-25T00:00:00.000Z' },
      wia: { value: 'wia.jwt.', expiresAt: '2026-07-25T00:00:00.000Z' },
    })
    expect(mockRequestAttestations).toHaveBeenCalledTimes(1)
  })

  test('activateWalletCryptoV2 leaves v2 disabled when attest fails', async () => {
    mockRequestAttestations.mockRejectedValue(new Error('WalletAttestRequestFailed:503'))

    await expect(activateWalletCryptoV2()).rejects.toThrow('WalletAttestRequestFailed:503')
    expect(isWalletCryptoV2Enabled()).toBe(false)
    expect(readCachedWalletAttestations()).toEqual({})
  })
})
