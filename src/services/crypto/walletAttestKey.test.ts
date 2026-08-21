import * as Keychain from 'react-native-keychain'

import { getMetaStorage } from '../storage/storage'
import {
  destroyWalletAttestKey,
  ensureWalletAttestKey,
  readWalletAttestPublicJwk,
} from './walletAttestKey'

const resetKeychainStore = (Keychain as unknown as { __resetStore: () => void }).__resetStore

describe('walletAttestKey', () => {
  beforeEach(() => {
    resetKeychainStore()
    getMetaStorage().clearAll()
  })

  test('ensureWalletAttestKey generates key and returns public JWK', async () => {
    const first = await ensureWalletAttestKey()
    expect(first.publicJwk.kty).toBe('OKP')
    expect(first.publicJwk.crv).toBe('Ed25519')
    expect(typeof first.publicJwk.x).toBe('string')
    expect(first.holderDid).toMatch(/^did:key:z/)

    const credentials = await Keychain.getGenericPassword({ service: 'wallet.ed25519_seed.attest' })
    expect(credentials).toBeTruthy()
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-ed25519-attest-seed',
      expect.any(String),
      expect.not.objectContaining({
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
      }),
    )
  })

  test('ensureWalletAttestKey is idempotent and readWalletAttestPublicJwk returns cached JWK', async () => {
    const first = await ensureWalletAttestKey()
    jest.mocked(Keychain.getGenericPassword).mockClear()
    jest.mocked(Keychain.setGenericPassword).mockClear()

    const second = await ensureWalletAttestKey()
    expect(second.publicJwk).toEqual(first.publicJwk)
    expect(readWalletAttestPublicJwk()).toEqual(first.publicJwk)
    expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
    expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
  })

  test('destroyWalletAttestKey removes Keychain entry and cached JWK', async () => {
    await ensureWalletAttestKey()
    await destroyWalletAttestKey()

    expect(readWalletAttestPublicJwk()).toBeUndefined()
    const credentials = await Keychain.getGenericPassword({ service: 'wallet.ed25519_seed.attest' })
    expect(credentials).toBe(false)
  })
})
