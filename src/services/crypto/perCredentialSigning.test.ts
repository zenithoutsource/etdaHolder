import { getMetaStorage } from '../storage/storage'
import { WALLET_CRYPTO_V2_META_KEY } from '@/src/config/walletCryptoPolicy'
import {
  discardIssuanceCredentialArtifacts,
  destroyIssuanceCredentialKey,
  usesPerCredentialSigning,
} from './perCredentialSigning'
import * as credentialSigningKey from './credentialSigningKey'
import * as hardwareCredentialSigningKey from './hardwareCredentialSigningKey'

describe('usesPerCredentialSigning', () => {
  const originalFlag = process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED

  afterEach(() => {
    getMetaStorage().clearAll()
    if (originalFlag === undefined) {
      delete process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED = originalFlag
    }
  })

  test('is true by default when Wallet Provider v2 flag is off', () => {
    delete process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED
    expect(getMetaStorage().getString(WALLET_CRYPTO_V2_META_KEY)).toBeUndefined()
    expect(usesPerCredentialSigning()).toBe(true)
  })

  test('can be disabled with EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED=false', () => {
    process.env.EXPO_PUBLIC_PER_CREDENTIAL_SIGNING_ENABLED = 'false'
    expect(usesPerCredentialSigning()).toBe(false)
  })
})

describe('discardIssuanceCredentialArtifacts', () => {
  const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalHardwareFlag === undefined) {
      delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
    }
  })

  test('destroys the hardware bound key and pending alias when hardware signing is on', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    jest.spyOn(hardwareCredentialSigningKey, 'destroyHardwareCredentialKey').mockResolvedValue()
    jest.spyOn(hardwareCredentialSigningKey, 'discardPendingHardwareCredentialKey').mockResolvedValue()
    jest.spyOn(hardwareCredentialSigningKey, 'discardHardwareCredentialKeyReplacement').mockResolvedValue(false)
    jest.spyOn(hardwareCredentialSigningKey, 'hasHardwareCredentialKey').mockReturnValue(true)
    jest.spyOn(credentialSigningKey, 'destroyCredentialKey').mockResolvedValue()
    jest.spyOn(credentialSigningKey, 'discardPendingCredentialKey').mockResolvedValue()

    await discardIssuanceCredentialArtifacts({
      credentialId: 'cred-preview-1',
      pendingCredentialKeyId: 'pending-1',
    })

    expect(hardwareCredentialSigningKey.destroyHardwareCredentialKey).toHaveBeenCalledWith('cred-preview-1')
    expect(hardwareCredentialSigningKey.discardPendingHardwareCredentialKey).toHaveBeenCalledWith('pending-1')
    expect(credentialSigningKey.destroyCredentialKey).not.toHaveBeenCalled()
  })

  test('destroyIssuanceCredentialKey destroys the Ed25519 key when hardware is on but unbound', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    jest.spyOn(hardwareCredentialSigningKey, 'discardHardwareCredentialKeyReplacement').mockResolvedValue(false)
    jest.spyOn(hardwareCredentialSigningKey, 'hasHardwareCredentialKey').mockReturnValue(false)
    jest.spyOn(hardwareCredentialSigningKey, 'destroyHardwareCredentialKey').mockResolvedValue()
    jest.spyOn(credentialSigningKey, 'discardSoftwareCredentialKeyReplacement').mockResolvedValue(false)
    jest.spyOn(credentialSigningKey, 'destroyCredentialKey').mockResolvedValue()

    await destroyIssuanceCredentialKey('legacy-ed25519')

    expect(hardwareCredentialSigningKey.destroyHardwareCredentialKey).not.toHaveBeenCalled()
    expect(credentialSigningKey.destroyCredentialKey).toHaveBeenCalledWith('legacy-ed25519')
  })
})

