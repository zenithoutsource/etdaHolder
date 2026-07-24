import * as Keychain from 'react-native-keychain'
import { __resetStore } from 'react-native-keychain'

import { getMetaStorage } from '../storage/storage'
import {
  destroyWalletAttestKey,
  ensureWalletAttestKey,
  readWalletAttestPublicJwk,
} from './walletAttestKey'

describe('walletAttestKey', () => {
  beforeEach(() => {
    __resetStore()
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
  })

  test('ensureWalletAttestKey is idempotent and readWalletAttestPublicJwk returns cached JWK', async () => {
    const first = await ensureWalletAttestKey()
    const second = await ensureWalletAttestKey()
    expect(second.publicJwk).toEqual(first.publicJwk)
    expect(readWalletAttestPublicJwk()).toEqual(first.publicJwk)
  })

  test('destroyWalletAttestKey removes Keychain entry and cached JWK', async () => {
    await ensureWalletAttestKey()
    await destroyWalletAttestKey()

    expect(readWalletAttestPublicJwk()).toBeUndefined()
    const credentials = await Keychain.getGenericPassword({ service: 'wallet.ed25519_seed.attest' })
    expect(credentials).toBe(false)
  })
})
