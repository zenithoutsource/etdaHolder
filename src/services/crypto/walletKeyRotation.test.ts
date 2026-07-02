import * as Keychain from 'react-native-keychain'

import { forceRotateWalletKey, generateWalletKeyIfNeeded } from './crypto'

describe('wallet key rotation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('rotates by overwriting the seed without starting an uncancellable Keychain read', async () => {
    await generateWalletKeyIfNeeded()
    jest.mocked(Keychain.getGenericPassword).mockClear()

    await forceRotateWalletKey(new Date('2026-06-29T00:00:00.000Z'))

    expect(Keychain.getGenericPassword).not.toHaveBeenCalled()
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'wallet-ed25519-seed',
      expect.any(String),
      expect.any(Object),
    )
  })
})
