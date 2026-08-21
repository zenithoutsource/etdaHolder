import { p256 } from '@noble/curves/nist.js'
import * as Keychain from 'react-native-keychain'

import { getCredentialStorage, getMetaStorage } from '../storage/storage'
import {
  bindPendingHardwareKeyToCredential,
  createPendingHardwareCredentialKey,
  readHardwareCredentialSigningPublicJwk,
} from './hardwareCredentialSigningKey'
import {
  bindPendingKeyToCredential,
  createPendingCredentialKey,
} from './credentialSigningKey'
import {
  createProofSigningSession,
  generateWalletKeyIfNeeded,
  getHolderDid,
  getPublicKeyJwk,
  signHolderStatusChangePop,
  signProof,
  signSdJwtKbPresentationToken,
  withUnlockedHolderSeedForProximity,
} from './crypto'
import { p256JwkToPublicKey, verifyEs256Prehash } from './p256Identity'

jest.mock('../storage/storage', () => {
  const actual = jest.requireActual('../storage/storage')
  return {
    ...actual,
    getCredentialStorage: jest.fn(),
  }
})

const getCredentialStorageMock = getCredentialStorage as jest.Mock

function mockCredentialStorage() {
  const values = new Map<string, string>()
  const storage = {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value)
    },
    remove: (key: string) => {
      values.delete(key)
      return true
    },
    getAllKeys: () => [...values.keys()],
  }
  getCredentialStorageMock.mockReturnValue(storage)
  return { values, storage }
}

import { __resetHardwareEcdsaSignerCacheForTests } from './hardwareEcdsaSigner'

function decodeJwtPart(part: string): Record<string, unknown> {
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  return JSON.parse(atob(padded)) as Record<string, unknown>
}

describe('crypto hardware P-256 router', () => {
  const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

  beforeEach(() => {
    getMetaStorage().clearAll()
    mockCredentialStorage()
    ;(Keychain as unknown as { __resetStore: () => void }).__resetStore()
    __resetHardwareEcdsaSignerCacheForTests()
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
  })

  afterEach(() => {
    if (originalHardwareFlag === undefined) {
      delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
    }
    __resetHardwareEcdsaSignerCacheForTests()
  })

  test('signProof embeds P-256 jwk for mso_mdoc keyBinding', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    const proof = await signProof('nonce-mdoc', 'https://issuer.example.com', {
      credentialKeyId: pendingId,
      keyBinding: 'jwk',
    })
    const header = decodeJwtPart(proof.split('.')[0]!)
    expect(header.alg).toBe('ES256')
    expect(header.typ).toBe('openid4vci-proof+jwt')
    expect(header.jwk).toMatchObject({ kty: 'EC', crv: 'P-256' })
    expect(header.kid).toBeUndefined()
    expect(header.cose_key).toBeUndefined()
  })

  test('signProof uses ES256 when hardware flag is enabled', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    const proof = await signProof('nonce-1', 'https://issuer.example.com', {
      credentialKeyId: pendingId,
      keyBinding: 'did-kid',
    })

    const [headerB64, payloadB64, signatureB64] = proof.split('.')
    const header = decodeJwtPart(headerB64!)
    expect(header.alg).toBe('ES256')

    const signingInput = `${headerB64}.${payloadB64}`
    const signature = Uint8Array.from(
      atob(signatureB64!.replace(/-/g, '+').replace(/_/g, '/')),
      (char) => char.charCodeAt(0),
    )
    const publicKey = p256JwkToPublicKey(await readHardwareCredentialSigningPublicJwk(pendingId))
    expect(verifyEs256Prehash(new TextEncoder().encode(signingInput), signature, publicKey)).toBe(true)
  })

  test('createProofSigningSession signs with bound hardware credential key', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(pendingId, 'cred-router-1', 'ThaiNationalID')

    const session = await createProofSigningSession('cred-router-1')
    try {
      const proof = await session.signProof('nonce-2', 'https://issuer.example.com')
      const header = decodeJwtPart(proof.split('.')[0]!)
      expect(header.alg).toBe('ES256')
    } finally {
      session.close()
    }
  })

  test('signHolderStatusChangePop uses ES256 for bound hardware credential', async () => {
    const pendingId = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(pendingId, 'cred-revoke-hw', 'ThaiNationalID')

    const jwt = await signHolderStatusChangePop({
      nonce: 'revoke-nonce',
      audience: 'https://issuer.example.com',
      credentialId: 'cred-revoke-hw',
    })

    const header = decodeJwtPart(jwt.split('.')[0]!)
    expect(header.alg).toBe('ES256')
    expect(header.typ).toBe('holder-status-change+jwt')
  })

  test('signProof throws HardwareCredentialKeyRequired without a credential key id', async () => {
    await expect(signProof('nonce-1', 'https://issuer.example.com')).rejects.toThrow(
      'HardwareCredentialKeyRequired',
    )
  })

  test('signSdJwtKbPresentationToken throws HardwareCredentialKeyRequired without credentialId', async () => {
    await expect(
      signSdJwtKbPresentationToken({
        audience: 'https://verifier.example.com',
        nonce: 'nonce-kb',
        sdJwt: 'header.payload.signature',
      }),
    ).rejects.toThrow('HardwareCredentialKeyRequired')
  })

  test('signHolderStatusChangePop throws LegacyHolderSigningUnsupported for software-bound credentials', async () => {
    const pendingId = await createPendingCredentialKey()
    await bindPendingKeyToCredential(pendingId, 'legacy-ed25519', 'ThaiNationalID')

    await expect(
      signHolderStatusChangePop({
        nonce: 'revoke-nonce',
        audience: 'https://issuer.example.com',
        credentialId: 'legacy-ed25519',
      }),
    ).rejects.toThrow('LegacyHolderSigningUnsupported')
  })

  test('signHolderStatusChangePop throws when hardware signing is disabled', async () => {
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'

    await expect(
      signHolderStatusChangePop({
        nonce: 'revoke-nonce',
        audience: 'https://issuer.example.com',
        credentialId: 'cred-revoke-flag-off',
      }),
    ).rejects.toThrow('LegacyHolderSigningUnsupported')
  })

  test('withUnlockedHolderSeedForProximity is blocked when hardware signing is on', async () => {
    await expect(
      withUnlockedHolderSeedForProximity(async () => undefined),
    ).rejects.toThrow('LegacyHolderSigningUnsupported')
  })

  test('getHolderDid stays on the Ed25519 wallet key when a hardware credential also exists', async () => {
    await generateWalletKeyIfNeeded()
    const ed25519Did = getHolderDid()
    const pendingId = await createPendingHardwareCredentialKey()
    await bindPendingHardwareKeyToCredential(pendingId, 'hw-cred-mixed', 'ThaiNationalID')

    expect(getHolderDid()).toBe(ed25519Did)
    expect(getPublicKeyJwk().crv).toBe('Ed25519')
  })
})
