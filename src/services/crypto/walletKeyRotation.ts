import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { isWalletKeyExpiredAt } from '@/src/config/walletKeyPolicy'

import {
  clearPreviousWalletKey,
  ensureWalletKeyRegisteredAtBackfill,
  forceRotateWalletKey,
  getHolderDid,
  getWalletKeyRegisteredAt,
  hasWalletKey,
  refreshWalletKeyRegisteredAt,
} from './crypto'
import { isWalletCryptoV2Enabled } from './walletCryptoActivation'
import { getCredentialKeyRecord, listCredentialKeyRecords } from './credentialKeyRegistry'
import { listEncryptedCredentialKeyRecords } from './encryptedCredentialKeyRegistry'
import { getMetaStorage } from '../storage/storage'
import { readStoredCredentials } from '../credentials/storedCredentials'
import { readCredentialHolderDid } from '../credentials/credentialHolderBinding'
import { upsertCredentialRenewal } from '../credentials/credentialKeyRenewal'
import { logWalletStep } from '../debug/walletLogger'

const ROTATION_RECORD_KEY = 'wallet.key_rotation'

export type WalletKeyRotationRecord = {
  previousHolderDid: string
  rotatedAt: string
  expiryPromptDismissedAt?: string
}

function hasHardwareCredentialKeys(): boolean {
  try {
    return listEncryptedCredentialKeyRecords().length > 0
  } catch (error) {
    if (error instanceof Error && error.message === 'StorageNotInitialized') return false
    throw error
  }
}

export function isWalletKeyExpired(now = new Date()): boolean {
  let registeredAt = getWalletKeyRegisteredAt()
  // v2 wallets and hardware k_cred bind times anchor TTL; backfill on read so
  // wallets created before registeredAt seeding still reach the expiry modal.
  if (
    !registeredAt &&
    (isWalletCryptoV2Enabled() ||
      listCredentialKeyRecords().length > 0 ||
      hasHardwareCredentialKeys())
  ) {
    ensureWalletKeyRegisteredAtBackfill(now)
    registeredAt = getWalletKeyRegisteredAt()
  }
  if (!registeredAt) {
    return hasWalletKey()
  }
  return isWalletKeyExpiredAt(registeredAt, now)
}

export function readWalletKeyRotationRecord(): WalletKeyRotationRecord | undefined {
  const raw = getMetaStorage().getString(ROTATION_RECORD_KEY)
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as Partial<WalletKeyRotationRecord>
    if (
      typeof parsed.previousHolderDid === 'string' &&
      typeof parsed.rotatedAt === 'string'
    ) {
      return parsed as WalletKeyRotationRecord
    }
  } catch {
    return undefined
  }

  return undefined
}

export function writeWalletKeyRotationRecord(record: WalletKeyRotationRecord): void {
  getMetaStorage().set(ROTATION_RECORD_KEY, JSON.stringify(record))
}

/**
 * Clears the wallet key rotation metadata record and the previous Keychain seed.
 * Called after all per-credential renewals are cleaned up
 * (P3: destroy previous did:key after renewal work completes).
 */
export async function clearWalletKeyRotationRecord(): Promise<void> {
  getMetaStorage().remove(ROTATION_RECORD_KEY)
  await clearPreviousWalletKey()
}

export async function rotateWalletKey(now = new Date()): Promise<{
  previousHolderDid?: string
  holderDid: string
  affectedCredentialIds: string[]
}> {
  if (isWalletCryptoV2Enabled() || isHardwareP256SigningEnabled()) {
    refreshWalletKeyRegisteredAt(now)
    logWalletStep('crypto', 'wallet-key-rotation-skipped-v2', {
      registeredAt: getWalletKeyRegisteredAt(),
      hardwareEnabled: isHardwareP256SigningEnabled(),
    })
    return {
      holderDid: getHolderDid(),
      affectedCredentialIds: [],
    }
  }

  // Only one previous Ed25519 seed is retained (single previous Keychain slot).
  // Rotating again while a prior rotation is still outstanding would overwrite
  // that seed and strand every credential still bound to it (they could no
  // longer produce the renewal OID4VP PoP). Enforce the spec §5.2 invariant:
  // one rotation at a time. The record is cleared by clearWalletKeyRotationRecord()
  // only after all per-credential renewal cleanup completes.
  if (readWalletKeyRotationRecord()) {
    throw new Error(
      'WalletKeyRotationBlockedPendingRenewals: finish renewing your existing documents before creating a new key',
    )
  }

  const previousHolderDid = hasWalletKey() ? getHolderDid() : undefined

  // Keychain read inside forceRotateWalletKey is the single biometric gate for rotation.
  logWalletStep('wallet-key-expiry', 'wallet-key-rotation-seed-write-start')
  await forceRotateWalletKey(now)
  logWalletStep('wallet-key-expiry', 'wallet-key-rotation-seed-write-complete')
  const holderDid = getHolderDid()

  if (previousHolderDid && previousHolderDid !== holderDid) {
    logWalletStep('wallet-key-expiry', 'wallet-key-rotation-record-write')
    writeWalletKeyRotationRecord({
      previousHolderDid,
      rotatedAt: now.toISOString(),
    })
  }

  const affectedCredentialIds: string[] = []
  for (const credential of readStoredCredentials()) {
    if (getCredentialKeyRecord(credential.id)) continue
    const boundHolderDid = readCredentialHolderDid(credential)
    if (!boundHolderDid || boundHolderDid === holderDid) continue

    upsertCredentialRenewal(
      credential.id,
      {
        previousHolderDid: boundHolderDid,
        state: 'renewal-required',
      },
      now,
    )
    affectedCredentialIds.push(credential.id)
  }

  logWalletStep('wallet-key-expiry', 'wallet-key-rotation-renewal-mark-complete', {
    affectedCredentialCount: affectedCredentialIds.length,
  })

  return {
    previousHolderDid,
    holderDid,
    affectedCredentialIds,
  }
}
