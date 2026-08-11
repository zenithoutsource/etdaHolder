import { p256 } from '@noble/curves/nist.js'

import { createCustomHardwareEcdsaSigner } from './hardwareEcdsaSigner.custom'
import { HardwareKeyNotFoundError, HardwareSigningSessionError } from './hardwareEcdsaTypes'
import { p256PublicKeyToJwk, signEs256Prehash } from './p256Identity'
import {
  __setWalletHardwareEcdsaNativeForTests,
  bytesToBase64,
} from './walletHardwareEcdsaNative'

const mockNative = {
  hasKey: jest.fn(),
  getSecurityLevel: jest.fn(),
  getPublicJwk: jest.fn(),
  createKey: jest.fn(),
  deleteKey: jest.fn(),
  openSigningSession: jest.fn(),
  signWithSession: jest.fn(),
  closeSigningSession: jest.fn(),
}

describe('hardwareEcdsaSigner.custom', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    __setWalletHardwareEcdsaNativeForTests(mockNative)
  })

  test('createKey forwards attestation challenge and parses certificate chain', async () => {
    const { secretKey } = p256.keygen()
    const publicKey = p256.getPublicKey(secretKey, true)
    const jwk = {
      kty: 'EC' as const,
      crv: 'P-256' as const,
      x: 'abc',
      y: 'def',
    }

    mockNative.createKey.mockResolvedValue({
      publicJwk: jwk,
      securityLevel: 'STRONGBOX',
      certificateChainDerBase64: [bytesToBase64(new Uint8Array([0x30, 0x03, 0x01, 0x02, 0x03]))],
    })
    mockNative.getPublicJwk.mockResolvedValue(jwk)

    const signer = createCustomHardwareEcdsaSigner()
    const challenge = new Uint8Array([0x01, 0x02])
    const result = await signer.createKey('wallet.p256.attest', { attestationChallenge: challenge })

    expect(mockNative.createKey).toHaveBeenCalledWith(
      expect.objectContaining({
        alias: 'wallet.p256.attest',
        attestationChallengeBase64: bytesToBase64(challenge),
      }),
    )
    expect(result.securityLevel).toBe('STRONGBOX')
    expect(result.certificateChainDer).toHaveLength(1)
    expect(result.publicJwk).toEqual(jwk)
    expect(publicKey).toHaveLength(33)
  })

  test('openSigningSession signs via native session handle', async () => {
    const { secretKey } = p256.keygen()
    const publicKey = p256.getPublicKey(secretKey, true)
    const message = new Uint8Array([0x11, 0x22, 0x33])
    const signature = signEs256Prehash(message, secretKey)

    mockNative.hasKey.mockResolvedValue(true)
    mockNative.getPublicJwk.mockResolvedValue(p256PublicKeyToJwk(publicKey))
    mockNative.openSigningSession.mockResolvedValue({ opaqueNativeHandle: 'native-session-1' })
    mockNative.signWithSession.mockResolvedValue({
      signatureBase64: bytesToBase64(signature),
      diagnostics: {
        signPath: 'auth-valid-no-prompt',
        userAuthPromptShown: false,
        dataBytes: message.length,
        signaturesUsed: 1,
        maxSignatures: 2,
      },
    })

    const signer = createCustomHardwareEcdsaSigner()
    const session = await signer.openSigningSession('wallet.p256.cred.pending.test', {
      purpose: 'oid4vci',
      maxSignatures: 2,
    })

    const signed = await session.sign(message)
    expect(signed).toEqual(signature)
    expect(mockNative.signWithSession).toHaveBeenCalledWith({
      opaqueNativeHandle: 'native-session-1',
      data: bytesToBase64(message),
    })
    await session.close()
    expect(mockNative.closeSigningSession).toHaveBeenCalledWith('native-session-1')
  })

  test('deleteKey delegates to native module', async () => {
    mockNative.deleteKey.mockResolvedValue(undefined)
    const signer = createCustomHardwareEcdsaSigner()
    await signer.deleteKey('wallet.p256.attest')
    expect(mockNative.deleteKey).toHaveBeenCalledWith('wallet.p256.attest')
  })

  test('maps native key-not-found to HardwareKeyNotFoundError', async () => {
    mockNative.getPublicJwk.mockRejectedValue({ code: 'WalletHardwareEcdsaKeyNotFound', message: 'KeyNotFound:missing' })
    const signer = createCustomHardwareEcdsaSigner()
    await expect(signer.getPublicJwk('missing')).rejects.toThrow(HardwareKeyNotFoundError)
  })

  test('maps native session failure to HardwareSigningSessionError', async () => {
    const { secretKey } = p256.keygen()
    const publicKey = p256.getPublicKey(secretKey, true)

    mockNative.hasKey.mockResolvedValue(true)
    mockNative.getPublicJwk.mockResolvedValue(p256PublicKeyToJwk(publicKey))
    mockNative.openSigningSession.mockResolvedValue({ opaqueNativeHandle: 'native-session-2' })
    mockNative.signWithSession.mockRejectedValue({
      code: 'WalletHardwareEcdsaSessionExpired',
      message: 'SigningSessionExpired',
    })

    const signer = createCustomHardwareEcdsaSigner()
    const session = await signer.openSigningSession('wallet.p256.attest', {
      purpose: 'attest',
      maxSignatures: 1,
    })

    await expect(session.sign(new Uint8Array([0x01]))).rejects.toThrow(HardwareSigningSessionError)
  })
})
