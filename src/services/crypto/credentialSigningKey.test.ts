import { getPublicKey, verify } from '@noble/ed25519'
import * as Keychain from 'react-native-keychain'

import { getMetaStorage } from '../storage/storage'
import { getCredentialKeyRecord } from './credentialKeyRegistry'
import {
  bindPendingKeyToCredential,
  createPendingCredentialKey,
  destroyCredentialKey,
  gcStalePendingKeys,
  getCredentialHolderDid,
  signWithCredentialKey,
} from './credentialSigningKey'

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

const resetKeychainStore = (Keychain as unknown as { __resetStore: () => void }).__resetStore

describe('credentialSigningKey', () => {
  beforeEach(() => {
    resetKeychainStore()
    getMetaStorage().clearAll()
  })

  test('createPendingCredentialKey returns unique id and stores retrievable seed', async () => {
    const pendingId = await createPendingCredentialKey()
    expect(pendingId).toMatch(/^[0-9a-f]{32}$/)

    const credentials = await Keychain.getGenericPassword({
      service: `wallet.ed25519_seed.cred.${pendingId}`,
    })
    expect(credentials).toBeTruthy()
    if (!credentials) throw new Error('Credential keychain seed missing')
    expect(base64ToUint8Array(credentials.password)).toHaveLength(32)
  })

  test('bindPendingKeyToCredential moves key to credentialId service and registry entry with valid did:key', async () => {
    const pendingId = await createPendingCredentialKey()
    const record = await bindPendingKeyToCredential(pendingId, 'cred-1', 'ThaiNationalID')

    expect(record.credentialId).toBe('cred-1')
    expect(record.holderDid).toMatch(/^did:key:z/)
    expect(record.keychainService).toBe('wallet.ed25519_seed.cred.cred-1')
    expect(getCredentialHolderDid('cred-1')).toBe(record.holderDid)
    expect(getCredentialKeyRecord('cred-1')).toEqual(record)

    const pendingCredentials = await Keychain.getGenericPassword({
      service: `wallet.ed25519_seed.cred.${pendingId}`,
    })
    expect(pendingCredentials).toBe(false)
  })

  test('signWithCredentialKey produces verifiable Ed25519 signature', async () => {
    const pendingId = await createPendingCredentialKey()
    await bindPendingKeyToCredential(pendingId, 'cred-sign', 'ThaiNationalID')

    const message = new TextEncoder().encode('wallet-credential-sign-test')
    const signature = await signWithCredentialKey('cred-sign', message)
    expect(signature).toHaveLength(64)

    const record = getCredentialKeyRecord('cred-sign')!
    const seedCredentials = await Keychain.getGenericPassword({ service: record.keychainService })
    if (!seedCredentials) throw new Error('Credential keychain seed missing')
    const seed = base64ToUint8Array(seedCredentials.password)
    const publicKey = getPublicKey(seed)
    expect(verify(signature, message, publicKey)).toBe(true)
  })

  test('destroyCredentialKey removes Keychain + registry; subsequent sign throws', async () => {
    const pendingId = await createPendingCredentialKey()
    await bindPendingKeyToCredential(pendingId, 'cred-destroy', 'ThaiNationalID')

    await destroyCredentialKey('cred-destroy')
    expect(getCredentialKeyRecord('cred-destroy')).toBeUndefined()

    const credentials = await Keychain.getGenericPassword({
      service: 'wallet.ed25519_seed.cred.cred-destroy',
    })
    expect(credentials).toBe(false)

    await expect(signWithCredentialKey('cred-destroy', new Uint8Array([1]))).rejects.toThrow(
      'CredentialKeyNotFound',
    )
  })

  test('gcStalePendingKeys removes pending older than TTL', async () => {
    const staleTime = new Date('2026-07-24T00:00:00.000Z')
    const freshTime = new Date('2026-07-24T01:15:00.000Z')
    const now = new Date('2026-07-24T01:31:00.000Z')

    const stalePendingId = await createPendingCredentialKey(staleTime)
    getMetaStorage().set(
      'wallet.pending_credential_keys.fresh-pending',
      JSON.stringify({ pendingId: 'fresh-pending', createdAt: freshTime.toISOString() }),
    )
    await Keychain.setGenericPassword(
      'wallet-ed25519-credential-seed',
      btoa(String.fromCharCode(...Array.from({ length: 32 }, (_, i) => i + 1))),
      { service: 'wallet.ed25519_seed.cred.fresh-pending' },
    )

    const removed = gcStalePendingKeys(now)
    expect(removed).toBe(1)

    const staleCredentials = await Keychain.getGenericPassword({
      service: `wallet.ed25519_seed.cred.${stalePendingId}`,
    })
    const freshCredentials = await Keychain.getGenericPassword({
      service: 'wallet.ed25519_seed.cred.fresh-pending',
    })
    expect(staleCredentials).toBe(false)
    expect(freshCredentials).toBeTruthy()
  })
})
