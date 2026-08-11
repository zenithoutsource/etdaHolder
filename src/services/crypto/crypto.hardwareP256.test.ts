import { p256 } from '@noble/curves/nist.js'

import { getCredentialStorage, getMetaStorage } from '../storage/storage'
import {
  bindPendingHardwareKeyToCredential,
  createPendingHardwareCredentialKey,
  readHardwareCredentialSigningPublicJwk,
} from './hardwareCredentialSigningKey'
import {
  createProofSigningSession,
  signHolderStatusChangePop,
  signProof,
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
  const originalV2Flag = process.env.EXPO_PUBLIC_WALLET_CRYPTO_V2_ENABLED

  beforeEach(() => {
    getMetaStorage().clearAll()
    mockCredentialStorage()
    __resetHardwareEcdsaSignerCacheForTests()
    process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
    delete process.env.EXPO_PUBLIC_WALLET_CRYPTO_V2_ENABLED
  })

  afterEach(() => {
    if (originalHardwareFlag === undefined) {
      delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
    } else {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
    }
    if (originalV2Flag === undefined) {
      delete process.env.EXPO_PUBLIC_WALLET_CRYPTO_V2_ENABLED
    } else {
      process.env.EXPO_PUBLIC_WALLET_CRYPTO_V2_ENABLED = originalV2Flag
    }
    __resetHardwareEcdsaSignerCacheForTests()
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
})
