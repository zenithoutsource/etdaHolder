import { injectTestMdlCredential, isTestMdlInjectAllowed } from './injectTestMdl'

jest.mock('./nativeProximityModule', () => ({
  requireNativeProximityModule: jest.fn(),
}))

jest.mock('../crypto/hardwareCredentialSigningKey', () => ({
  createPendingHardwareCredentialKey: jest.fn(),
  readHardwareCredentialSigningPublicJwk: jest.fn(),
  bindPendingHardwareKeyToCredential: jest.fn(),
  discardPendingHardwareCredentialKey: jest.fn(),
}))

jest.mock('../crypto/crypto', () => ({
  getPublicKeyJwk: jest.fn(),
}))

jest.mock('./mdocStorage', () => ({
  storeMdocCredential: jest.fn(),
}))

jest.mock('../vci/exchangeService', () => ({
  saveCredentialRecord: jest.fn(),
}))

jest.mock('../credentials/mdocWalletClaims', () => ({
  extractMdocWalletClaims: () => ({ familyName: 'TEST', givenName: 'HOLDER', birthDate: '1990-01-01' }),
}))

import { getPublicKeyJwk } from '../crypto/crypto'
import {
  bindPendingHardwareKeyToCredential,
  createPendingHardwareCredentialKey,
  discardPendingHardwareCredentialKey,
  readHardwareCredentialSigningPublicJwk,
} from '../crypto/hardwareCredentialSigningKey'

describe('injectTestMdlCredential', () => {
  const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

  afterEach(() => {
    if (originalHardwareFlag === undefined) {
      delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
    }
    jest.clearAllMocks()
  })

  test('isTestMdlInjectAllowed is false outside development', () => {
    expect(isTestMdlInjectAllowed(false)).toBe(false)
    expect(isTestMdlInjectAllowed(true)).toBe(true)
  })

  test('refuses to run when not in development', async () => {
    await expect(injectTestMdlCredential({ isDevelopment: false })).rejects.toThrow('TestMdlInjectDisabled')
  })

  test('creates DLTDrivingLicence and stores mdoc when enabled (software DeviceKey)', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
    jest.mocked(getPublicKeyJwk).mockReturnValue({ kty: 'OKP', crv: 'Ed25519', x: 'dGVzdA' })
    const mdocBytes = new Uint8Array([1, 2, 3, 4])
    const generateTestMdl = jest.fn(async () => mdocBytes)
    const storeMdoc = jest.fn(async () => undefined)
    const saveRecord = jest.fn()

    const record = await injectTestMdlCredential({
      isDevelopment: true,
      generateTestMdl,
      storeMdoc,
      saveRecord,
    })

    expect(record.type).toBe('DLTDrivingLicence')
    expect(record.rawVc.startsWith('mdoc:')).toBe(true)
    expect(generateTestMdl).toHaveBeenCalledTimes(1)
    expect(generateTestMdl).toHaveBeenCalledWith(JSON.stringify({ kty: 'OKP', crv: 'Ed25519', x: 'dGVzdA' }))
    expect(storeMdoc).toHaveBeenCalledTimes(1)
    expect(saveRecord).toHaveBeenCalledWith(
      record,
      expect.objectContaining({ appendHistory: false }),
    )
    expect(createPendingHardwareCredentialKey).not.toHaveBeenCalled()
  })

  test('creates hardware k_cred and binds DeviceKey when hardware signing is on', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    jest.mocked(createPendingHardwareCredentialKey).mockResolvedValue('pending-1')
    jest.mocked(readHardwareCredentialSigningPublicJwk).mockResolvedValue({
      kty: 'EC',
      crv: 'P-256',
      x: 'eA',
      y: 'eQ',
    })
    jest.mocked(bindPendingHardwareKeyToCredential).mockResolvedValue({} as never)
    const generateTestMdl = jest.fn(async () => new Uint8Array([9, 8, 7]))
    const storeMdoc = jest.fn(async () => undefined)
    const saveRecord = jest.fn()

    const record = await injectTestMdlCredential({
      isDevelopment: true,
      generateTestMdl,
      storeMdoc,
      saveRecord,
    })

    expect(record.type).toBe('DLTDrivingLicence')
    expect(generateTestMdl).toHaveBeenCalledWith(JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'eA', y: 'eQ' }))
    expect(bindPendingHardwareKeyToCredential).toHaveBeenCalledWith(
      'pending-1',
      record.id,
      'DLTDrivingLicence',
    )
    expect(discardPendingHardwareCredentialKey).not.toHaveBeenCalled()
  })

  test('discards a pending hardware key when generate fails', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    jest.mocked(createPendingHardwareCredentialKey).mockResolvedValue('pending-fail')
    jest.mocked(readHardwareCredentialSigningPublicJwk).mockResolvedValue({
      kty: 'EC',
      crv: 'P-256',
      x: 'eA',
      y: 'eQ',
    })
    jest.mocked(discardPendingHardwareCredentialKey).mockResolvedValue(undefined)
    const generateTestMdl = jest.fn(async () => {
      throw new Error('native generate failed')
    })

    await expect(
      injectTestMdlCredential({
        isDevelopment: true,
        generateTestMdl,
        storeMdoc: jest.fn(),
        saveRecord: jest.fn(),
      }),
    ).rejects.toThrow('native generate failed')

    expect(discardPendingHardwareCredentialKey).toHaveBeenCalledWith('pending-fail')
    expect(bindPendingHardwareKeyToCredential).not.toHaveBeenCalled()
  })
})
