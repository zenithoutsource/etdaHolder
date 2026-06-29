import { getHolderDid } from '../crypto/crypto'
import {
  clearCredentialRenewal,
  readCredentialRenewal,
  readCredentialRenewalStatuses,
  upsertCredentialRenewal,
  writeCredentialRenewal,
} from './credentialKeyRenewal'
import { notifyCredentialsChanged, readStoredCredentials, removeStoredCredential } from './storedCredentials'
import { readCredentialHolderDid } from './credentialHolderBinding'
import {
  claimCredential,
  resolveOffer,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from '../vci/exchangeService'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { clearWalletKeyRotationRecord } from '../crypto/walletKeyRotation'
import { clearRenewalCleanupBannerDismissal, isRenewalAwaitingHolderCleanup } from './renewalCleanupNotification'
import { clearCredentialLifecycleStatus } from './credentialLifecycle'
import { findRenewedActiveCredentialForType } from './credentialGuard'

const DEV_RENEWAL_REQUEST_ENDPOINT = '/wallet-api/dev/wallet/renewal-request'
const DEV_RENEWAL_STATUS_ENDPOINT = '/wallet-api/dev/wallet/renewal-status'
const RENEWAL_REQUEST_TIMEOUT_MS = 30_000

const renewalClaimsInFlight = new Set<string>()

type RenewalRequestPayload = {
  accepted?: boolean
}

type RenewalStatusPayload = {
  renewals: {
    credentialId: string
    state: 'requested' | 'offer-ready' | 'revoked'
    offerUri?: string
    revokedAt?: string
  }[]
}

type RenewalServiceDependencies = {
  fetchImpl: typeof fetch
  resolveOffer: (offerUri: string) => Promise<ResolvedCredentialOffer>
  claimCredential: (
    resolvedOffer: ResolvedCredentialOffer,
  ) => Promise<VerifiableCredentialRecord>
  getHolderDid: () => string
}

function resolveDependencies(
  dependencies: Partial<RenewalServiceDependencies> = {},
): RenewalServiceDependencies {
  return {
    fetchImpl: fetch,
    resolveOffer,
    claimCredential,
    getHolderDid,
    ...dependencies,
  }
}

function assertRenewalSubmittable(credentialId: string): void {
  const credentials = readStoredCredentials()
  const renewalStatuses = readCredentialRenewalStatuses(credentials)
  const record = renewalStatuses[credentialId] ?? readCredentialRenewal(credentialId)

  if (record && record.state !== 'renewal-required') {
    throw new Error('CredentialRenewalAlreadySubmitted')
  }

  const credential = credentials.find((entry) => entry.id === credentialId)
  if (
    credential &&
    findRenewedActiveCredentialForType(credential.type, credentials, renewalStatuses)
  ) {
    throw new Error('CredentialRenewalReplacementAlreadyReceived')
  }
}

export function repairInconsistentRenewalPairs(now = new Date()): void {
  const credentials = readStoredCredentials()

  for (const credential of credentials) {
    const renewal = readCredentialRenewal(credential.id)
    if (renewal?.state !== 'renewed-active') continue

    const staleOldCredential = credentials.find((candidate) => {
      if (candidate.type !== credential.type || candidate.id === credential.id) {
        return false
      }

      const candidateRenewal = readCredentialRenewal(candidate.id)
      return (
        candidateRenewal?.state === 'renewal-required' ||
        candidateRenewal?.state === 'renewal-processing'
      )
    })

    if (!staleOldCredential) continue

    const staleRenewal = readCredentialRenewal(staleOldCredential.id)
    if (!staleRenewal) continue

    writeCredentialRenewal({
      credentialId: staleOldCredential.id,
      previousHolderDid: staleRenewal.previousHolderDid,
      replacementCredentialId: credential.id,
      renewedAt: renewal.renewedAt ?? now.toISOString(),
      state: 'cleanup-pending',
      updatedAt: now.toISOString(),
    })
  }
}

export async function submitRenewalRequest(
  credentialId: string,
  dependencies: Partial<RenewalServiceDependencies> = {},
): Promise<void> {
  const currentCredential = readStoredCredentials().find((record) => record.id === credentialId)
  if (!currentCredential) {
    throw new Error(`CredentialRenewalNotFound: ${credentialId}`)
  }

  const oldHolderDid = readCredentialHolderDid(currentCredential)
  if (!oldHolderDid) {
    throw new Error(`CredentialRenewalBindingMissing: ${credentialId}`)
  }

  assertRenewalSubmittable(credentialId)

  const resolvedDependencies = resolveDependencies(dependencies)
  const newHolderDid = resolvedDependencies.getHolderDid()

  try {
    logWalletStep('renewal', 'request-start', {
      credentialId,
      credentialType: currentCredential.type,
    })
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), RENEWAL_REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await resolvedDependencies.fetchImpl(DEV_RENEWAL_REQUEST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credentialId,
          credentialType: currentCredential.type,
          oldHolderDid,
          newHolderDid,
          rawVc: currentCredential.rawVc,
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      throw new Error(`CredentialRenewalRequestFailed: HTTP ${response.status}`)
    }

    const payload = (await response.json()) as Partial<RenewalRequestPayload>
    if (payload.accepted !== true) {
      throw new Error('CredentialRenewalRequestNotAccepted')
    }

    upsertCredentialRenewal(
      credentialId,
      {
        previousHolderDid: oldHolderDid,
        state: 'renewal-processing',
      },
      new Date(),
    )

    logWalletStep('renewal', 'request-submitted', { credentialId })
  } catch (error) {
    logWalletError('renewal', 'request-failed', error, { credentialId })
    throw error
  }
}

async function completeRenewalClaim(
  credentialId: string,
  offerUri: string,
  dependencies: RenewalServiceDependencies,
): Promise<void> {
  if (renewalClaimsInFlight.has(credentialId)) return

  const current = readCredentialRenewal(credentialId)
  if (!current || current.state !== 'renewal-processing') {
    return
  }

  renewalClaimsInFlight.add(credentialId)
  const now = new Date()
  try {
    logWalletStep('renewal', 'claim-start', { credentialId })
    const offer = await dependencies.resolveOffer(offerUri)
    const replacement = await dependencies.claimCredential(offer)

    const latest = readCredentialRenewal(credentialId)
    if (!latest || latest.state !== 'renewal-processing') {
      return
    }

    writeCredentialRenewal({
      credentialId,
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
      credentialId,
      replacementCredentialId: replacement.id,
    })
  } catch (error) {
    logWalletError('renewal', 'claim-failed', error, { credentialId })
    throw error
  } finally {
    renewalClaimsInFlight.delete(credentialId)
  }
}

function recoverOrphanedRenewalProcessing(serverCredentialIds: Set<string>): void {
  if (!__DEV__) return

  for (const credential of readStoredCredentials()) {
    const renewal = readCredentialRenewal(credential.id)
    if (renewal?.state !== 'renewal-processing') continue
    if (serverCredentialIds.has(credential.id)) continue

    upsertCredentialRenewal(
      credential.id,
      {
        previousHolderDid: renewal.previousHolderDid,
        state: 'renewal-required',
      },
      new Date(),
    )
    logWalletStep('renewal', 'orphan-processing-reset', { credentialId: credential.id })
  }
}

export async function refreshAndCompleteRenewals(
  dependencies: Partial<RenewalServiceDependencies> = {},
): Promise<void> {
  const resolvedDependencies = resolveDependencies(dependencies)
  let serverCredentialIds = new Set<string>()

  try {
    const response = await resolvedDependencies.fetchImpl(DEV_RENEWAL_STATUS_ENDPOINT)
    if (!response.ok) return

    const payload = (await response.json()) as Partial<RenewalStatusPayload>
    if (!Array.isArray(payload.renewals)) return

    serverCredentialIds = new Set(
      payload.renewals
        .map((renewal) => renewal.credentialId)
        .filter((credentialId): credentialId is string => typeof credentialId === 'string'),
    )

    for (const renewal of payload.renewals) {
      const current = readCredentialRenewal(renewal.credentialId)
      if (!current) continue

      if (renewal.state === 'offer-ready' && renewal.offerUri) {
        if (current.state === 'renewal-processing') {
          try {
            await completeRenewalClaim(
              renewal.credentialId,
              renewal.offerUri,
              resolvedDependencies,
            )
          } catch {
            // Keep renewal-processing; retry on next focus poll.
          }
        }
        continue
      }

      if (renewal.state === 'revoked' && current.state === 'cleanup-pending') {
        upsertCredentialRenewal(
          renewal.credentialId,
          {
            ...current,
            state: 'old-revoked',
            revokedAt: renewal.revokedAt ?? current.revokedAt,
          },
          new Date(),
        )
      }
    }
  } catch (error) {
    logWalletError('renewal', 'status-refresh-failed', error)
  } finally {
    recoverOrphanedRenewalProcessing(serverCredentialIds)
    repairInconsistentRenewalPairs()
  }
}

/** @deprecated Use submitRenewalRequest + refreshAndCompleteRenewals */
export async function requestCredentialRenewal(
  credentialId: string,
  dependencies: Partial<RenewalServiceDependencies> = {},
): Promise<VerifiableCredentialRecord> {
  await submitRenewalRequest(credentialId, dependencies)
  await refreshAndCompleteRenewals(dependencies)
  const record = readCredentialRenewal(credentialId)
  const replacementId = record?.replacementCredentialId
  if (!replacementId) {
    throw new Error('CredentialRenewalReplacementMissing')
  }
  const replacement = readStoredCredentials().find((entry) => entry.id === replacementId)
  if (!replacement) {
    throw new Error('CredentialRenewalReplacementMissing')
  }
  return replacement
}

export function markCredentialRenewalCleanupPending(
  credentialId: string,
  now = new Date(),
): void {
  const record = readCredentialRenewal(credentialId)
  if (!record) return

  upsertCredentialRenewal(
    credentialId,
    {
      ...record,
      state: 'cleanup-pending',
    },
    now,
  )
}

export function confirmOldCredentialCleanup(credentialId: string): void {
  const oldRenewal = readCredentialRenewal(credentialId)
  const replacementCredentialId = oldRenewal?.replacementCredentialId

  clearCredentialRenewal(credentialId)
  clearRenewalCleanupBannerDismissal(credentialId)
  clearCredentialLifecycleStatus(credentialId)
  removeStoredCredential(credentialId)

  if (replacementCredentialId) {
    clearCredentialRenewal(replacementCredentialId)
  }

  const hasPendingRenewalWork = readStoredCredentials().some((credential) => {
    const renewal = readCredentialRenewal(credential.id)
    if (!renewal) return false

    return isRenewalAwaitingHolderCleanup(renewal) || renewal.state === 'renewal-required' || renewal.state === 'renewal-processing'
  })
  if (!hasPendingRenewalWork) {
    clearWalletKeyRotationRecord()
  }

  notifyCredentialsChanged()
}

export async function refreshCredentialRenewalStatuses(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await refreshAndCompleteRenewals({ fetchImpl })
}
