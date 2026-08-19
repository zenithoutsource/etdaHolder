/**
 * P3 Home ขอเอกสาร intake: mint pending k_cred, then Issuer portal/Scan.
 * Does not POST /wallet-api/dev/wallet/renewal-request.
 * Journey: P3 renewal.
 * Map: docs/CODEMAPS/frontend.md#wallet
 */

import { getCardSchemaForConfigurationId } from '@/src/config/cardSchemas'
import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { getPreviousHolderDid } from '../crypto/crypto'
import {
  createPendingHardwareCredentialKey,
  discardPendingHardwareCredentialKey,
  hasHardwareCredentialKey,
  resolveHardwareCredentialHolderDid,
} from '../crypto/hardwareCredentialSigningKey'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { recordCredentialRenewalCompleted } from '../history/walletHistoryRecording'
import { syncPushTokenRegistration } from '../notifications/pushNotificationService'
import type { ResolvedCredentialOffer, VerifiableCredentialRecord } from '../vci/exchangeService'
import { canSubmitCredentialRenewal } from './credentialGuard'
import { readCredentialHolderDid } from './credentialHolderBinding'
import {
  readCredentialRenewal,
  upsertCredentialRenewal,
  writeCredentialRenewal,
} from './credentialKeyRenewal'
import { inferPortalCredentialTypeFromOffer } from './inferPortalCredentialType'
import { readStoredCredentials } from './storedCredentials'

export type RenewalIssuerIntake = {
  credentialId: string
  credentialType: string
  pendingCredentialKeyId?: string
}

async function discardPendingIntakeKey(pendingId: string | undefined): Promise<void> {
  if (!pendingId) return
  await discardPendingHardwareCredentialKey(pendingId).catch((error) => {
    logWalletError('renewal', 'discard-pending-key-failed', error, { pendingId })
  })
}

export function findRenewalRequiredIntakeForType(
  credentialType: string,
): RenewalIssuerIntake | undefined {
  const credentials = readStoredCredentials()
  let processingMatch: RenewalIssuerIntake | undefined

  for (const credential of credentials) {
    if (credential.type !== credentialType) continue
    const renewal = readCredentialRenewal(credential.id)
    if (renewal?.state === 'renewal-required') {
      return {
        credentialId: credential.id,
        credentialType,
        pendingCredentialKeyId: renewal.pendingCredentialKeyId,
      }
    }
    if (renewal?.state === 'renewal-processing' && !processingMatch) {
      processingMatch = {
        credentialId: credential.id,
        credentialType,
        pendingCredentialKeyId: renewal.pendingCredentialKeyId,
      }
    }
  }

  return processingMatch
}

export function readRenewalIntakePendingKeyForOffer(
  offer: ResolvedCredentialOffer,
): string | undefined {
  const inferred = inferPortalCredentialTypeFromOffer(offer)
  const schemaType = getCardSchemaForConfigurationId(
    offer.credentialConfigurations[0]?.id,
  ).type
  const credentialType =
    inferred ?? (schemaType !== '__fallback__' ? schemaType : undefined)
  if (!credentialType) return undefined
  return findRenewalRequiredIntakeForType(credentialType)?.pendingCredentialKeyId
}

export function pairRenewalReplacement(
  oldCredentialId: string,
  replacement: VerifiableCredentialRecord,
  now = new Date(),
): void {
  const current = readCredentialRenewal(oldCredentialId)
  if (!current) return
  if (current.state !== 'renewal-required' && current.state !== 'renewal-processing') {
    return
  }
  if (replacement.id === oldCredentialId) return

  writeCredentialRenewal({
    credentialId: oldCredentialId,
    previousHolderDid: current.previousHolderDid,
    replacementCredentialId: replacement.id,
    renewedAt: now.toISOString(),
    state: 'cleanup-pending',
    updatedAt: now.toISOString(),
  })

  upsertCredentialRenewal(
    replacement.id,
    {
      previousHolderDid: current.previousHolderDid,
      renewedAt: now.toISOString(),
      state: 'renewed-active',
    },
    now,
  )

  logWalletStep('renewal', 'claim-complete', {
    credentialId: oldCredentialId,
    replacementCredentialId: replacement.id,
  })
  recordCredentialRenewalCompleted(replacement)
}

export function pairRenewalReplacementForSavedCredential(
  replacement: VerifiableCredentialRecord,
  now = new Date(),
): boolean {
  const intake = findRenewalRequiredIntakeForType(replacement.type)
  if (!intake || intake.credentialId === replacement.id) return false
  pairRenewalReplacement(intake.credentialId, replacement, now)
  return true
}

export async function startRenewalIssuerIntake(
  credentialId: string,
): Promise<RenewalIssuerIntake> {
  const credentials = readStoredCredentials()
  if (!canSubmitCredentialRenewal(credentialId, credentials)) {
    throw new Error(`CredentialRenewalNotSubmittable: ${credentialId}`)
  }

  const currentCredential = credentials.find((record) => record.id === credentialId)
  if (!currentCredential) {
    throw new Error(`CredentialRenewalNotFound: ${credentialId}`)
  }

  const oldHolderDid = readCredentialHolderDid(currentCredential)
  if (!oldHolderDid) {
    throw new Error(`CredentialRenewalBindingMissing: ${credentialId}`)
  }

  const hardwarePath =
    isHardwareP256SigningEnabled() && hasHardwareCredentialKey(credentialId)

  if (!hardwarePath && oldHolderDid !== getPreviousHolderDid()) {
    throw new Error(
      `CredentialRenewalPreviousKeyUnavailable: ${credentialId} is bound to a wallet key that is no longer retained; request a new document from the issuer`,
    )
  }

  const existingPendingId = readCredentialRenewal(credentialId)?.pendingCredentialKeyId
  await discardPendingIntakeKey(existingPendingId)

  let pendingCredentialKeyId: string | undefined

  try {
    if (hardwarePath) {
      pendingCredentialKeyId = await createPendingHardwareCredentialKey()
      const newHolderDid = resolveHardwareCredentialHolderDid(pendingCredentialKeyId)
      try {
        await syncPushTokenRegistration(newHolderDid)
      } catch (error) {
        logWalletError('renewal', 'push-token-sync-failed', error, { credentialId })
      }
    }

    writeCredentialRenewal({
      credentialId,
      previousHolderDid: oldHolderDid,
      ...(pendingCredentialKeyId ? { pendingCredentialKeyId } : {}),
      state: 'renewal-required',
      updatedAt: new Date().toISOString(),
    })

    logWalletStep('renewal', 'issuer-intake-start', {
      credentialId,
      credentialType: currentCredential.type,
      hardwarePath,
      pendingCredentialKeyId,
    })

    return {
      credentialId,
      credentialType: currentCredential.type,
      pendingCredentialKeyId,
    }
  } catch (error) {
    await discardPendingIntakeKey(pendingCredentialKeyId)
    logWalletError('renewal', 'issuer-intake-failed', error, { credentialId })
    throw error
  }
}

export async function abortRenewalIssuerIntake(credentialId: string): Promise<void> {
  const current = readCredentialRenewal(credentialId)
  if (!current || current.state !== 'renewal-required') return

  await discardPendingIntakeKey(current.pendingCredentialKeyId)
  if (!current.pendingCredentialKeyId) return

  writeCredentialRenewal({
    credentialId,
    previousHolderDid: current.previousHolderDid,
    state: 'renewal-required',
    updatedAt: new Date().toISOString(),
  })
  logWalletStep('renewal', 'issuer-intake-aborted', { credentialId })
}
