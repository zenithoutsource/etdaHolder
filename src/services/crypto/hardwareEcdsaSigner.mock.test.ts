import {
  createMockHardwareEcdsaSigner,
  createStrongBoxFallbackProbeSigner,
  resetMockHardwareEcdsaStores,
} from './hardwareEcdsaSigner.mock'
import {
  HardwareEcdsaUnavailableError,
  HardwareKeyNotFoundError,
  HardwareSigningSessionError,
} from './hardwareEcdsaTypes'
import { assertEs256SignatureBytes, p256JwkToPublicKey, verifyEs256Prehash } from './p256Identity'

describe('hardwareEcdsaSigner.mock', () => {
  beforeEach(() => {
    resetMockHardwareEcdsaStores()
  })

  test('createKey returns attestation chain when attestationChallenge is supplied', async () => {
    const signer = createMockHardwareEcdsaSigner()
    const challenge = new Uint8Array([0x01, 0x02, 0x03])
    const result = await signer.createKey('wallet.p256.attest', { attestationChallenge: challenge })

    expect(result.publicJwk.crv).toBe('P-256')
    expect(result.securityLevel).toBe('STRONGBOX')
    expect(result.certificateChainDer).toHaveLength(2)
  })

  test('StrongBox fallback probe creates TEE key only on explicit StrongBox unavailability', async () => {
    const signer = createStrongBoxFallbackProbeSigner()
    const result = await signer.createKey('wallet.p256.attest')
    expect(result.securityLevel).toBe('TEE')
  })

  test('generic keygen failure fails closed without TEE fallback', async () => {
    const signer = createMockHardwareEcdsaSigner()
    await expect(
      signer.createKey('wallet.p256.attest', { simulateGenericKeygenFailure: true }),
    ).rejects.toBeInstanceOf(HardwareEcdsaUnavailableError)
  })

  test('openSigningSession signs ES256 prehash up to maxSignatures', async () => {
    const signer = createMockHardwareEcdsaSigner()
    await signer.createKey('wallet.p256.cred.pending.test')
    const publicJwk = await signer.getPublicJwk('wallet.p256.cred.pending.test')

    const session = await signer.openSigningSession('wallet.p256.cred.pending.test', {
      purpose: 'oid4vci',
      maxSignatures: 2,
    })

    const message = new TextEncoder().encode('proof')
    const sig1 = await session.sign(message)
    const sig2 = await session.sign(message)
    assertEs256SignatureBytes(sig1)
    assertEs256SignatureBytes(sig2)

    const publicKey = p256JwkToPublicKey(publicJwk)
    expect(verifyEs256Prehash(message, sig1, publicKey)).toBe(true)
    expect(verifyEs256Prehash(message, sig2, publicKey)).toBe(true)

    await expect(session.sign(message)).rejects.toBeInstanceOf(HardwareSigningSessionError)
    await session.close()
  })

  test('hasKey is false after deleteKey and missing alias throws HardwareKeyNotFoundError', async () => {
    const signer = createMockHardwareEcdsaSigner()
    await signer.createKey('wallet.p256.cred.pending.delete-me')
    await signer.deleteKey('wallet.p256.cred.pending.delete-me')

    expect(await signer.hasKey('wallet.p256.cred.pending.delete-me')).toBe(false)
    await expect(signer.getPublicJwk('wallet.p256.cred.pending.delete-me')).rejects.toBeInstanceOf(
      HardwareKeyNotFoundError,
    )
  })

  test('getSecurityLevel reflects create path security level', async () => {
    const signer = createMockHardwareEcdsaSigner()
    await signer.createKey('wallet.p256.attest', { simulateStrongBoxUnavailable: true })
    expect(await signer.getSecurityLevel('wallet.p256.attest')).toBe('TEE')
  })
})
