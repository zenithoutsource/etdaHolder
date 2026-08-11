import { p256 } from '@noble/curves/nist.js'

import {
  __resetAnimoHardwareEcdsaSessionsForTests,
  createAnimoHardwareEcdsaSigner,
} from './hardwareEcdsaSigner.animo'
import { HardwareEcdsaUnavailableError, HardwareKeyNotFoundError } from './hardwareEcdsaTypes'
import { signEs256Prehash } from './p256Identity'

const mockGenerateKeypair = jest.fn()
const mockGetPublicBytesForKeyId = jest.fn()
const mockAnimoSign = jest.fn()
const mockAnimoDeleteKey = jest.fn()
const mockIsSupported = jest.fn(() => true)
const mockReadSecurityLevel: jest.MockedFunction<(alias: string) => Promise<'STRONGBOX'>> = jest.fn()

jest.mock('@animo-id/expo-secure-environment', () => ({
  generateKeypair: (...args: unknown[]) => mockGenerateKeypair(...args),
  getPublicBytesForKeyId: (...args: unknown[]) => mockGetPublicBytesForKeyId(...args),
  sign: (...args: unknown[]) => mockAnimoSign(...args),
  deleteKey: (...args: unknown[]) => mockAnimoDeleteKey(...args),
  isLocalSecureEnvironmentSupported: () => mockIsSupported(),
}))

jest.mock('./walletHardwareEcdsaNative', () => ({
  readAndroidKeySecurityLevel: (alias: string) => mockReadSecurityLevel(alias),
}))

describe('hardwareEcdsaSigner.animo', () => {
  beforeEach(() => {
    __resetAnimoHardwareEcdsaSessionsForTests()
    mockGenerateKeypair.mockReset()
    mockGetPublicBytesForKeyId.mockReset()
    mockAnimoSign.mockReset()
    mockAnimoDeleteKey.mockReset()
    mockIsSupported.mockReturnValue(true)
    mockReadSecurityLevel.mockResolvedValue('STRONGBOX')
  })

  test('createKey rejects attestation challenge', async () => {
    const signer = createAnimoHardwareEcdsaSigner()
    await expect(
      signer.createKey('wallet.p256.attest', { attestationChallenge: new Uint8Array([0x01]) }),
    ).rejects.toThrow(HardwareEcdsaUnavailableError)
  })

  test('createKey generates alias and reports security level', async () => {
    const { secretKey } = p256.keygen()
    const compressed = p256.getPublicKey(secretKey, true)
    mockGetPublicBytesForKeyId.mockResolvedValue(compressed)

    const signer = createAnimoHardwareEcdsaSigner()
    const result = await signer.createKey('wallet.p256.attest')

    expect(mockGenerateKeypair).toHaveBeenCalledWith('wallet.p256.attest', true)
    expect(result.securityLevel).toBe('STRONGBOX')
    expect(result.publicJwk.crv).toBe('P-256')
  })

  test('openSigningSession uses biometric only on first sign', async () => {
    const { secretKey } = p256.keygen()
    const compressed = p256.getPublicKey(secretKey, true)
    mockGetPublicBytesForKeyId.mockResolvedValue(compressed)

    const message = new Uint8Array([0xab, 0xcd])
    const signature = signEs256Prehash(message, secretKey)
    mockAnimoSign.mockResolvedValueOnce(signature).mockResolvedValueOnce(signature)

    const signer = createAnimoHardwareEcdsaSigner()
    const session = await signer.openSigningSession('wallet.p256.cred.pending.test', {
      purpose: 'oid4vci',
      maxSignatures: 2,
    })

    await session.sign(message)
    await session.sign(message)

    expect(mockAnimoSign).toHaveBeenNthCalledWith(1, 'wallet.p256.cred.pending.test', message, true)
    expect(mockAnimoSign).toHaveBeenNthCalledWith(2, 'wallet.p256.cred.pending.test', message, false)
    await session.close()
  })

  test('deleteKey removes alias via Animo API', async () => {
    mockAnimoDeleteKey.mockResolvedValue(undefined)
    const signer = createAnimoHardwareEcdsaSigner()
    await signer.deleteKey('wallet.p256.attest')
    expect(mockAnimoDeleteKey).toHaveBeenCalledWith('wallet.p256.attest')
  })

  test('hasKey returns false when public bytes lookup fails', async () => {
    mockGetPublicBytesForKeyId.mockRejectedValue(new Error('missing'))
    const signer = createAnimoHardwareEcdsaSigner()
    await expect(signer.hasKey('missing.alias')).resolves.toBe(false)
  })

  test('getPublicJwk throws HardwareKeyNotFoundError when alias is missing', async () => {
    mockGetPublicBytesForKeyId.mockRejectedValue(new Error('missing'))
    const signer = createAnimoHardwareEcdsaSigner()
    await expect(signer.getPublicJwk('missing.alias')).rejects.toThrow(HardwareKeyNotFoundError)
  })
})
