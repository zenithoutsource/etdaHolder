import { isWalletKeyExpiredAt } from '@/src/config/walletKeyPolicy'

import {
  forceRotateWalletKey,
  getHolderDid,
  getWalletKeyRegisteredAt,
  hasWalletKey,
} from './crypto'
import { getMetaStorage } from '../storage/storage'
import { readStoredCredentials } from '../credentials/storedCredentials'
import { readCredentialHolderDid } from '../credentials/credentialHolderBinding'
import { upsertCredentialRenewal } from '../credentials/credentialKeyRenewal'

const ROTATION_RECORD_KEY = 'wallet.key_rotation'

export type WalletKeyRotationRecord = {
  previousHolderDid: string
  rotatedAt: string
  expiryPromptDismissedAt?: string
}

export function isWalletKeyExpired(now = new Date()): boolean {
  return isWalletKeyExpiredAt(getWalletKeyRegisteredAt(), now)
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
 * Clears the wallet key rotation metadata record.
 * Called after all per-credential renewals are cleaned up
 * (P3 step 18: "ทำลายกุญแจดอกเก่าทิ้ง").
 * The actual old Ed25519 seed was already replaced in Keychain during rotateWalletKey().
 */
export function clearWalletKeyRotationRecord(): void {
  getMetaStorage().remove(ROTATION_RECORD_KEY)
}

export async function rotateWalletKey(now = new Date()): Promise<{
  previousHolderDid?: string
  holderDid: string
  affectedCredentialIds: string[]
}> {
  const previousHolderDid = hasWalletKey() ? getHolderDid() : undefined

  await forceRotateWalletKey(now)
  const holderDid = getHolderDid()

  if (previousHolderDid && previousHolderDid !== holderDid) {
    writeWalletKeyRotationRecord({
      previousHolderDid,
      rotatedAt: now.toISOString(),
    })
  }

  const affectedCredentialIds: string[] = []
  for (const credential of readStoredCredentials()) {
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

  return {
    previousHolderDid,
    holderDid,
    affectedCredentialIds,
  }
}
