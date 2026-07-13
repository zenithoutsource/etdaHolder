import * as Keychain from 'react-native-keychain'
import { randomBytes } from 'react-native-quick-crypto'
import { __resetStore } from '@/src/__mocks__/react-native-keychain'

import {
  clearPreviousWalletKey,
  forceRotateWalletKey,
  generateWalletKeyIfNeeded,
  getHolderDid,
  getPreviousHolderDid,
  hasPreviousWalletKey,
  signPresentationVpTokenWithPreviousKey,
} from './crypto'
import { getMetaStorage } from '../storage/storage'

const ACTIVE_SERVICE = 'etda.wallet.ed25519_seed'
const PREVIOUS_SERVICE = 'wallet.ed25519_seed.previous'

function seedBytes(fill: number): Buffer {
  return Buffer.alloc(32, fill)
}

describe('wallet key rotation dual-key retention', () => {
  beforeEach(() => {
    getMetaStorage().clearAll()
    __resetStore()
    jest.clearAllMocks()
    process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING = 'true'
    let call = 0
    jest.mocked(randomBytes).mockImplementation((size: number) => {
      call += 1
      return Buffer.alloc(size, call)
    })
  })

  test('retains previous seed on rotate and signs with it', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(1))
    await generateWalletKeyIfNeeded()
    const previousDid = getHolderDid()

    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(2))
    await forceRotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))

    expect(getHolderDid()).not.toBe(previousDid)
    expect(getPreviousHolderDid()).toBe(previousDid)
    expect(hasPreviousWalletKey()).toBe(true)
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-ed25519-seed-previous',
      expect.any(String),
      expect.objectContaining({ service: PREVIOUS_SERVICE }),
    )
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-ed25519-seed',
      expect.any(String),
      expect.objectContaining({ service: ACTIVE_SERVICE }),
    )

    const vp = await signPresentationVpTokenWithPreviousKey({
      audience: 'https://issuer.example.com/oid4vp',
      nonce: 'nonce-1',
      verifiableCredential: 'eyJ.test',
    })
    expect(vp.split('.')).toHaveLength(3)
  })

  test('clearPreviousWalletKey wipes previous seed and blocks previous signing', async () => {
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(3))
    await generateWalletKeyIfNeeded()
    jest.mocked(randomBytes).mockImplementationOnce(() => seedBytes(4))
    await forceRotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))
    expect(hasPreviousWalletKey()).toBe(true)

    await clearPreviousWalletKey()

    expect(hasPreviousWalletKey()).toBe(false)
    expect(getPreviousHolderDid()).toBeUndefined()
    await expect(
      signPresentationVpTokenWithPreviousKey({
        audience: 'https://issuer.example.com/oid4vp',
        nonce: 'nonce-1',
        verifiableCredential: 'eyJ.test',
      }),
    ).rejects.toThrow('PreviousWalletKeyNotInitialized')
  })
})
