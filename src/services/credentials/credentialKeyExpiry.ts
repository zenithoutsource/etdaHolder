import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { isWalletKeyExpiredAt, readMsUntilWalletKeyExpiry } from '@/src/config/walletKeyPolicy'
import { getEncryptedCredentialKeyRecord } from '../crypto/encryptedCredentialKeyRegistry'
import { logWalletStep } from '../debug/walletLogger'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import { isJwtLikeCredentialRaw, readCredentialHolderDid } from './credentialHolderBinding'
import {
  clearCredentialRenewal,
  readCredentialRenewal,
  upsertCredentialRenewal,
  type CredentialRenewalState,
} from './credentialKeyRenewal'
import { readStoredCredentials } from './storedCredentials'

const SKIP_TTL_RENEWAL_STATES = new Set<CredentialRenewalState>([
  'renewal-required',
  'renewal-processing',
  'cleanup-pending',
  'old-revoked',
  'renewed-active',
])

export function shouldMarkCredentialKeyRenewalRequired(input: {
  hasHardwareKCred: boolean
  kCredCreatedAt?: string
  documentExpired: boolean
  renewalState?: CredentialRenewalState
  now?: Date
}): boolean {
  if (!input.hasHardwareKCred || !input.kCredCreatedAt) return false
  if (input.documentExpired) return false
  if (input.renewalState && SKIP_TTL_RENEWAL_STATES.has(input.renewalState)) return false
  return isWalletKeyExpiredAt(input.kCredCreatedAt, input.now)
}

function isStorageNotInitialized(error: unknown): boolean {
  return error instanceof Error && error.message === 'StorageNotInitialized'
}

/**
 * Policy overlay: hardware k_cred TTL elapsed while the VC is still a valid document.
 * Does not rewrite renewal state. Calendar-expired documents stay on ขอเอกสารใหม่.
 */
export function isStoredCredentialKeyTtlExpired(
  credential: Pick<VerifiableCredentialRecord, 'id' | 'expiresAt' | 'claims' | 'type'> & {
    rawVc?: string
  },
  now = new Date(),
): boolean {
  if (!isHardwareP256SigningEnabled()) return false
  if (credential.rawVc !== undefined && !isJwtLikeCredentialRaw(credential.rawVc)) return false
  if (isCredentialDocumentExpired(credential, now)) return false

  try {
    const keyRecord = getEncryptedCredentialKeyRecord(credential.id)
    if (!keyRecord) return false
    return isWalletKeyExpiredAt(keyRecord.createdAt, now)
  } catch (error) {
    if (isStorageNotInitialized(error)) return false
    throw error
  }
}

export function syncCredentialKeyTtlRenewals(now = new Date()): number {
  if (!isHardwareP256SigningEnabled()) return 0

  let marked = 0
  for (const credential of readStoredCredentials()) {
    const keyRecord = getEncryptedCredentialKeyRecord(credential.id)
    const renewal = readCredentialRenewal(credential.id)

    if (!isJwtLikeCredentialRaw(credential.rawVc)) {
      if (renewal?.state === 'renewal-required' || renewal?.state === 'renewal-processing') {
        logWalletStep('renewal', 'k-cred-ttl-renewal-cleared-non-jwt', {
          credentialId: credential.id,
          credentialType: credential.type,
        })
        clearCredentialRenewal(credential.id)
      }
      continue
    }

    if (
      !shouldMarkCredentialKeyRenewalRequired({
        hasHardwareKCred: Boolean(keyRecord),
        kCredCreatedAt: keyRecord?.createdAt,
        documentExpired: isCredentialDocumentExpired(credential),
        renewalState: renewal?.state,
        now,
      })
    ) {
      continue
    }

    const previousHolderDid = readCredentialHolderDid(credential)
    if (!previousHolderDid) continue

    upsertCredentialRenewal(
      credential.id,
      {
        previousHolderDid,
        state: 'renewal-required',
      },
      now,
    )
    marked += 1
    logWalletStep('renewal', 'k-cred-ttl-renewal-required', {
      credentialId: credential.id,
      credentialType: credential.type,
    })
  }

  return marked
}

export function readNearestCredentialKeyExpiryBoundaryMs(
  now = Date.now(),
): number | undefined {
  if (!isHardwareP256SigningEnabled()) return undefined

  let nearest: number | undefined
  for (const credential of readStoredCredentials()) {
    const keyRecord = getEncryptedCredentialKeyRecord(credential.id)
    if (!keyRecord) continue
    if (!isJwtLikeCredentialRaw(credential.rawVc)) continue
    if (isCredentialDocumentExpired(credential)) continue
    if (readCredentialRenewal(credential.id)) continue

    const remaining = readMsUntilWalletKeyExpiry(keyRecord.createdAt, now)
    if (remaining === undefined) continue
    if (nearest === undefined || remaining < nearest) nearest = remaining
  }

  return nearest
}
