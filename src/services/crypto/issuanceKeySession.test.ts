import * as Keychain from 'react-native-keychain'

import { WALLET_CRYPTO_V2_META_KEY } from '@/src/config/walletCryptoPolicy'
import { getMetaStorage } from '../storage/storage'
import { getCredentialKeyRecord } from './credentialKeyRegistry'
import { withIssuanceKeySession } from './issuanceKeySession'
import { activateWalletCryptoV2 } from './walletCryptoActivation'

const resetKeychainStore = (Keychain as unknown as { __resetStore: () => void }).__resetStore

jest.mock('./walletCryptoActivation', () => {
  const { getMetaStorage: readMeta } = jest.requireActual('../storage/storage') as typeof import('../storage/storage')
  const { WALLET_CRYPTO_V2_META_KEY: v2Key } = jest.requireActual(
    '@/src/config/walletCryptoPolicy',
  ) as typeof import('@/src/config/walletCryptoPolicy')

  return {
    isWalletCryptoV2Enabled: () => readMeta().getString(v2Key) === 'true',
    activateWalletCryptoV2: jest.fn(async () => {
      readMeta().set(v2Key, 'true')
    }),
  }
})

describe('withIssuanceKeySession', () => {
  beforeEach(() => {
    resetKeychainStore()
    getMetaStorage().clearAll()
    jest.mocked(activateWalletCryptoV2).mockClear()
    jest.mocked(Keychain.setGenericPassword).mockClear()
    jest.mocked(Keychain.getGenericPassword).mockClear()
  })

  test('signs from memory without Keychain get and binds with one biometric set', async () => {
    await withIssuanceKeySession(async (session) => {
      await session.activateV2IfNeeded()
      expect(getMetaStorage().getString(WALLET_CRYPTO_V2_META_KEY)).toBe('true')
      expect(activateWalletCryptoV2).toHaveBeenCalledTimes(1)

      jest.mocked(Keychain.getGenericPassword).mockClear()
      jest.mocked(Keychain.setGenericPassword).mockClear()

      const jwt = await session.proofSession.signProof('nonce-1', 'https://issuer.example.com')
      expect(typeof jwt).toBe('string')
      expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
      expect(Keychain.setGenericPassword).not.toHaveBeenCalled()

      await session.proofSession.bindCredentialKey!('cred-1', 'ThaiNationalID')
      expect(Keychain.setGenericPassword).toHaveBeenCalledTimes(1)
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        'wallet-ed25519-credential-seed',
        expect.any(String),
        expect.objectContaining({
          service: 'wallet.ed25519_seed.cred.cred-1',
          accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY_OR_DEVICE_PASSCODE,
          authenticationPrompt: expect.objectContaining({
            title: expect.any(String),
          }),
        }),
      )
      expect(getCredentialKeyRecord('cred-1')?.holderDid).toMatch(/^did:key:z/)
    })
  })

  test('activateV2IfNeeded calls activateWalletCryptoV2 even when v2 is already enabled', async () => {
    getMetaStorage().set(WALLET_CRYPTO_V2_META_KEY, 'true')

    await withIssuanceKeySession(async (session) => {
      await session.activateV2IfNeeded()
    })

    expect(activateWalletCryptoV2).toHaveBeenCalledTimes(1)
  })

  test('activateV2IfNeeded reuses attest cache without rewriting on second session', async () => {
    await withIssuanceKeySession(async (session) => {
      await session.activateV2IfNeeded()
    })

    jest.mocked(Keychain.setGenericPassword).mockClear()
    jest.mocked(activateWalletCryptoV2).mockClear()

    await withIssuanceKeySession(async (session) => {
      await session.activateV2IfNeeded()
    })

    expect(activateWalletCryptoV2).toHaveBeenCalledTimes(1)
    expect(Keychain.setGenericPassword).not.toHaveBeenCalled()
  })

  test('failure discards pending meta without leaving a pending Keychain seed', async () => {
    let pendingId = ''
    await expect(
      withIssuanceKeySession(async (session) => {
        pendingId = session.pendingCredentialKeyId
        throw new Error('claim-failed')
      }),
    ).rejects.toThrow('claim-failed')

    expect(getMetaStorage().getString(`wallet.pending_credential_keys.${pendingId}`)).toBeUndefined()
    const credentials = await Keychain.getGenericPassword({
      service: `wallet.ed25519_seed.cred.${pendingId}`,
    })
    expect(credentials).toBe(false)
  })
})
