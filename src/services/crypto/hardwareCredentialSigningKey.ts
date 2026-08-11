import { randomBytes } from 'react-native-quick-crypto'

import { readDefaultMaxSignatures } from '@/src/config/hardwareSigningPolicy'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import { getMetaStorage } from '@/src/services/storage/storage'

import {
  bindPendingCredentialAlias,
  destroyEncryptedCredentialKey,
  getEncryptedCredentialKeyRecord,
  type EncryptedCredentialKeyRecord,
} from './encryptedCredentialKeyRegistry'
import { getHardwareEcdsaSigner } from './hardwareEcdsaSigner'
import type {
  EcP256Jwk,
  HardwareSecurityLevel,
  HardwareSigningPurpose,
  HardwareSigningSession,
} from './hardwareEcdsaTypes'
import { pendingCredentialAlias } from './hardwareEcdsaTypes'
import {
  p256JwkToPublicKey,
  p256PublicKeyToDidKey,
  p256PublicKeyToJwk,
} from './p256Identity'

const PENDING_META_PREFIX = 'wallet.pending_hardware_credential_keys.'

type PendingHardwareKeyMeta = {
  pendingId: string
  alias: string
  holderDid: string
  publicJwk: EcP256Jwk
  securityLevel: HardwareSecurityLevel
  createdAt: string
}

function pendingMetaKey(pendingId: string): string {
  return `${PENDING_META_PREFIX}${pendingId}`
}

function createPendingId(): string {
  const bytes = randomBytes(16)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function readPendingHardwareKeyMeta(pendingId: string): PendingHardwareKeyMeta | undefined {
  const raw = getMetaStorage().getString(pendingMetaKey(pendingId))
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as Partial<PendingHardwareKeyMeta>
    if (
      typeof parsed.pendingId === 'string' &&
      typeof parsed.alias === 'string' &&
      typeof parsed.holderDid === 'string' &&
      typeof parsed.createdAt === 'string' &&
      parsed.publicJwk &&
      typeof parsed.publicJwk.kty === 'string' &&
      (parsed.securityLevel === 'STRONGBOX' || parsed.securityLevel === 'TEE')
    ) {
      return parsed as PendingHardwareKeyMeta
    }
  } catch {
    return undefined
  }
  return undefined
}

function writePendingHardwareKeyMeta(meta: PendingHardwareKeyMeta): void {
  getMetaStorage().set(pendingMetaKey(meta.pendingId), JSON.stringify(meta))
}

function removePendingHardwareKeyMeta(pendingId: string): void {
  getMetaStorage().remove(pendingMetaKey(pendingId))
}

function resolveAliasForKey(keyId: string): string | undefined {
  const bound = getEncryptedCredentialKeyRecord(keyId)
  if (bound) return bound.alias
  return readPendingHardwareKeyMeta(keyId)?.alias
}

export type HardwareCredentialKeySigningSession = {
  credentialKeyId: string
  publicJwk: EcP256Jwk
  holderDid: string
  hardwareSession: HardwareSigningSession
  sign: (message: Uint8Array) => Promise<Uint8Array>
  bindCredentialKey: (credentialId: string, credentialType: string) => Promise<EncryptedCredentialKeyRecord>
  close: () => Promise<void>
}

export async function createPendingHardwareCredentialKey(now = new Date()): Promise<string> {
  const pendingId = createPendingId()
  const alias = pendingCredentialAlias(pendingId)
  const signer = getHardwareEcdsaSigner()

  try {
    const created = await signer.createKey(alias)
    const publicKey = p256JwkToPublicKey(created.publicJwk)
    const holderDid = p256PublicKeyToDidKey(publicKey)

    writePendingHardwareKeyMeta({
      pendingId,
      alias,
      holderDid,
      publicJwk: created.publicJwk,
      securityLevel: created.securityLevel,
      createdAt: now.toISOString(),
    })

    logWalletStep('hardware-ecdsa', 'hardware-credential-pending-key-created', {
      pendingId,
      alias,
      securityLevel: created.securityLevel,
      holderDidPrefix: holderDid.slice(0, 24),
    })
    return pendingId
  } catch (error) {
    try {
      if (await signer.hasKey(alias)) {
        await signer.deleteKey(alias)
      }
    } catch (cleanupError) {
      logWalletError('hardware-ecdsa', 'hardware-credential-pending-key-rollback-failed', cleanupError, {
        pendingId,
      })
    }
    throw error
  }
}

export async function openHardwareCredentialSigningSession(
  keyId: string,
  purpose: HardwareSigningPurpose,
  maxSignatures = readDefaultMaxSignatures(purpose),
): Promise<HardwareSigningSession> {
  const alias = resolveAliasForKey(keyId)
  if (!alias) throw new Error('HardwareCredentialKeyNotFound')

  const signer = getHardwareEcdsaSigner()
  return signer.openSigningSession(alias, { purpose, maxSignatures })
}

export async function createHardwarePendingCredentialKeySession(
  purpose: HardwareSigningPurpose = 'oid4vci',
  now = new Date(),
): Promise<HardwareCredentialKeySigningSession> {
  const pendingId = await createPendingHardwareCredentialKey(now)
  const meta = readPendingHardwareKeyMeta(pendingId)
  if (!meta) throw new Error('PendingHardwareCredentialKeyNotFound')

  const hardwareSession = await openHardwareCredentialSigningSession(
    pendingId,
    purpose,
    readDefaultMaxSignatures(purpose),
  )

  let closed = false

  return {
    credentialKeyId: pendingId,
    publicJwk: meta.publicJwk,
    holderDid: meta.holderDid,
    hardwareSession,
    sign: async (message) => {
      if (closed) throw new Error('HardwareCredentialKeySigningSessionClosed')
      return hardwareSession.sign(message)
    },
    bindCredentialKey: async (credentialId, credentialType) =>
      bindPendingHardwareKeyToCredential(pendingId, credentialId, credentialType, now),
    close: async () => {
      if (closed) return
      closed = true
      try {
        await hardwareSession.close()
      } catch (error) {
        logWalletError('hardware-ecdsa', 'hardware-credential-session-close-failed', error, { pendingId })
        throw error
      }
    },
  }
}

export async function bindPendingHardwareKeyToCredential(
  pendingId: string,
  credentialId: string,
  credentialType: string,
  now = new Date(),
): Promise<EncryptedCredentialKeyRecord> {
  const meta = readPendingHardwareKeyMeta(pendingId)
  if (!meta) throw new Error('PendingHardwareCredentialKeyNotFound')

  const signer = getHardwareEcdsaSigner()
  if (!(await signer.hasKey(meta.alias))) {
    throw new Error('HardwareCredentialKeyAliasMissing')
  }

  const record = bindPendingCredentialAlias({
    credentialId,
    alias: meta.alias,
    holderDid: meta.holderDid,
    credentialType,
    securityLevelHint: meta.securityLevel,
    createdAt: now.toISOString(),
  })

  removePendingHardwareKeyMeta(pendingId)
  logWalletStep('hardware-ecdsa', 'hardware-credential-key-bound', { credentialId, credentialType })
  return record
}

export function readHardwareCredentialHolderDid(credentialId: string): string {
  return resolveHardwareCredentialHolderDid(credentialId)
}

export function resolveHardwareCredentialHolderDid(keyId: string): string {
  const bound = getEncryptedCredentialKeyRecord(keyId)
  if (bound) return bound.holderDid

  const pending = readPendingHardwareKeyMeta(keyId)
  if (pending) return pending.holderDid

  throw new Error('HardwareCredentialKeyNotFound')
}

export async function readHardwareCredentialSigningPublicJwk(keyId: string): Promise<EcP256Jwk> {
  const bound = getEncryptedCredentialKeyRecord(keyId)
  if (bound) {
    const signer = getHardwareEcdsaSigner()
    return signer.getPublicJwk(bound.alias)
  }

  const pending = readPendingHardwareKeyMeta(keyId)
  if (pending) return pending.publicJwk

  throw new Error('HardwareCredentialKeyNotFound')
}

export async function discardPendingHardwareCredentialKey(pendingId: string): Promise<void> {
  const meta = readPendingHardwareKeyMeta(pendingId)
  if (!meta) return

  const signer = getHardwareEcdsaSigner()
  try {
    if (await signer.hasKey(meta.alias)) {
      await signer.deleteKey(meta.alias)
    }
    removePendingHardwareKeyMeta(pendingId)
    logWalletStep('hardware-ecdsa', 'hardware-credential-pending-key-discarded', { pendingId })
  } catch (error) {
    logWalletError('hardware-ecdsa', 'hardware-credential-pending-key-discard-failed', error, { pendingId })
  }
}

export async function destroyHardwareCredentialKey(credentialId: string): Promise<void> {
  await destroyEncryptedCredentialKey(credentialId, getHardwareEcdsaSigner())
}

/** Resolves pending or bound hardware key public material for DID derivation. */
export async function readHardwareCredentialPublicKeyBytes(keyId: string): Promise<Uint8Array> {
  const jwk = await readHardwareCredentialSigningPublicJwk(keyId)
  return p256JwkToPublicKey(jwk)
}

export function readHardwareCredentialPublicJwkFromBytes(publicKey: Uint8Array): EcP256Jwk {
  return p256PublicKeyToJwk(publicKey)
}
