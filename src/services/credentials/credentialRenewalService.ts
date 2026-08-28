import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import { getHolderDid, getPreviousHolderDid } from '../crypto/crypto'
import {
  createPendingHardwareCredentialKey,
  discardPendingHardwareCredentialKey,
  hasHardwareCredentialKey,
  resolveHardwareCredentialHolderDid,
} from '../crypto/hardwareCredentialSigningKey'
import { destroyIssuanceCredentialKey } from '../crypto/perCredentialSigning'
import {
  clearCredentialRenewal,
  readCredentialRenewal,
  readCredentialRenewalStatuses,
  upsertCredentialRenewal,
  writeCredentialRenewal,
} from './credentialKeyRenewal'
import { purgeCredentialStorageKeys } from './credentialDeletion'
import { notifyCredentialsChanged, readStoredCredentials } from './storedCredentials'
import { readCredentialHolderDid } from './credentialHolderBinding'
import {
  resolveOffer,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from '../vci/exchangeService'
import { claimCredentialWithDualFormatSupport } from './dualFormatIssuance'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { pairRenewalReplacement } from './renewalIssuerIntake'
import { clearWalletKeyRotationRecord } from '../crypto/walletKeyRotation'
import { isRenewalAwaitingHolderCleanup } from './renewalCleanupNotification'
import { findRenewedActiveCredentialForType } from './credentialGuard'
import { syncPushTokenRegistration } from '../notifications/pushNotificationService'
import {
  presentOldCredentialForRenewal,
  type SilentRenewalOid4VpDependencies,
} from './renewalOid4VpPresentation'

const DEV_RENEWAL_REQUEST_ENDPOINT = '/wallet-api/dev/wallet/renewal-request'
const DEV_RENEWAL_STATUS_ENDPOINT = '/wallet-api/dev/wallet/renewal-status'
const RENEWAL_REQUEST_TIMEOUT_MS = 30_000

const renewalClaimsInFlight = new Set<string>()

type RenewalRequestPayload = {
  accepted?: boolean
  authorizationRequest?: string
}

type RenewalStatusPayload = {
  renewals: {
    credentialId: string
    state: 'requested' | 'offer-ready' | 'revoked'
    offerUri?: string
    revokedAt?: string
  }[]
}

type RenewalClaimOptions = {
  pendingCredentialKeyId?: string
}

type RenewalServiceDependencies = {
  fetchImpl: typeof fetch
  resolveOffer: (offerUri: string) => Promise<ResolvedCredentialOffer>
  claimCredential: (
    resolvedOffer: ResolvedCredentialOffer,
    options?: RenewalClaimOptions,
  ) => Promise<VerifiableCredentialRecord>
  getHolderDid: () => string
  syncPushTokenRegistration: (holderDid: string) => Promise<boolean>
  presentOldCredentialForRenewal: typeof presentOldCredentialForRenewal
  silentOid4VpDependencies?: Partial<SilentRenewalOid4VpDependencies>
  isHardwareEnabled?: () => boolean
  hasHardwareCredentialKey?: (credentialId: string) => boolean
  createPendingHardwareCredentialKey?: () => Promise<string>
  readPendingHardwareHolderDid?: (pendingId: string) => string
  discardPendingHardwareCredentialKey?: (pendingId: string) => Promise<void>
  destroyIssuanceCredentialKey?: (credentialId: string) => Promise<void>
}

function resolveDependencies(
  dependencies: Partial<RenewalServiceDependencies> = {},
): RenewalServiceDependencies {
  return {
    fetchImpl: fetch,
    resolveOffer,
    claimCredential: (offer, options) =>
      claimCredentialWithDualFormatSupport(offer, options ?? {}),
    getHolderDid,
    syncPushTokenRegistration,
    presentOldCredentialForRenewal,
    isHardwareEnabled: isHardwareP256SigningEnabled,
    hasHardwareCredentialKey,
    createPendingHardwareCredentialKey,
    readPendingHardwareHolderDid: resolveHardwareCredentialHolderDid,
    discardPendingHardwareCredentialKey,
    destroyIssuanceCredentialKey,
    ...dependencies,
  }
}

async function discardPendingRenewalKey(
  pendingId: string | undefined,
  discardPending: (pendingId: string) => Promise<void>,
): Promise<void> {
  if (!pendingId) return
  await discardPending(pendingId).catch((error) => {
    logWalletError('renewal', 'discard-pending-key-failed', error, { pendingId })
  })
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

function clearReadyOfferUri(credentialId: string): void {
  const current = readCredentialRenewal(credentialId)
  if (!current?.readyOfferUri) return

  upsertCredentialRenewal(
    credentialId,
    {
      ...current,
      readyOfferUri: undefined,
    },
    new Date(),
  )
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
  const hardwarePath =
    Boolean(resolvedDependencies.isHardwareEnabled?.()) &&
    Boolean(resolvedDependencies.hasHardwareCredentialKey?.(credentialId))

  if (!hardwarePath && oldHolderDid !== getPreviousHolderDid()) {
    throw new Error(
      `CredentialRenewalPreviousKeyUnavailable: ${credentialId} is bound to a wallet key that is no longer retained; request a new document from the issuer`,
    )
  }

  const existingPendingId = readCredentialRenewal(credentialId)?.pendingCredentialKeyId
  await discardPendingRenewalKey(
    existingPendingId,
    resolvedDependencies.discardPendingHardwareCredentialKey ?? (async () => undefined),
  )

  let pendingCredentialKeyId: string | undefined
  let newHolderDid = resolvedDependencies.getHolderDid()

  try {
    if (hardwarePath) {
      pendingCredentialKeyId = await resolvedDependencies.createPendingHardwareCredentialKey?.()
      if (!pendingCredentialKeyId) {
        throw new Error('CredentialRenewalPendingKeyMissing')
      }
      newHolderDid =
        resolvedDependencies.readPendingHardwareHolderDid?.(pendingCredentialKeyId) ?? newHolderDid
    }

    try {
      await resolvedDependencies.syncPushTokenRegistration(newHolderDid)
    } catch (error) {
      logWalletError('renewal', 'push-token-sync-failed', error, { credentialId })
    }

    logWalletStep('renewal', 'request-start', {
      credentialId,
      credentialType: currentCredential.type,
      hardwarePath,
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

    const authorizationRequest =
      typeof payload.authorizationRequest === 'string' ? payload.authorizationRequest.trim() : ''
    if (!authorizationRequest) {
      throw new Error('CredentialRenewalAuthorizationRequestMissing')
    }

    try {
      await resolvedDependencies.presentOldCredentialForRenewal(
        authorizationRequest,
        currentCredential,
        {
          fetchImpl: resolvedDependencies.fetchImpl,
          ...resolvedDependencies.silentOid4VpDependencies,
        },
      )
    } catch (error) {
      logWalletError('renewal', 'oid4vp-submit-failed', error, { credentialId })
      throw error
    }

    upsertCredentialRenewal(
      credentialId,
      {
        previousHolderDid: oldHolderDid,
        readyOfferUri: undefined,
        pendingCredentialKeyId,
        state: 'renewal-processing',
      },
      new Date(),
    )

    logWalletStep('renewal', 'request-submitted', { credentialId, pendingCredentialKeyId })
  } catch (error) {
    await discardPendingRenewalKey(
      pendingCredentialKeyId,
      resolvedDependencies.discardPendingHardwareCredentialKey ?? (async () => undefined),
    )
    logWalletError('renewal', 'request-failed', error, { credentialId })
    throw error
  }
}

async function completeRenewalClaim(
  credentialId: string,
  offerUri: string,
  dependencies: RenewalServiceDependencies,
): Promise<void> {
  const current = readCredentialRenewal(credentialId)
  if (!current || current.state !== 'renewal-processing') {
    return
  }

  const now = new Date()
  try {
    logWalletStep('renewal', 'claim-start', { credentialId })
    const offer = await dependencies.resolveOffer(offerUri)
    const replacement = await dependencies.claimCredential(offer, {
      pendingCredentialKeyId: current.pendingCredentialKeyId,
    })

    const latest = readCredentialRenewal(credentialId)
    if (!latest || latest.state !== 'renewal-processing') {
      return
    }

    pairRenewalReplacement(credentialId, replacement, now)
  } catch (error) {
    logWalletError('renewal', 'claim-failed', error, { credentialId })
    const latest = readCredentialRenewal(credentialId)
    if (latest?.state === 'renewal-processing') {
      await discardPendingRenewalKey(
        latest.pendingCredentialKeyId,
        dependencies.discardPendingHardwareCredentialKey ?? (async () => undefined),
      )
      upsertCredentialRenewal(
        credentialId,
        {
          previousHolderDid: latest.previousHolderDid,
          readyOfferUri: undefined,
          pendingCredentialKeyId: undefined,
          state: 'renewal-required',
        },
        new Date(),
      )
    }
    throw error
  }
}

async function recoverOrphanedRenewalProcessing(
  serverCredentialIds: Set<string>,
  discardPending: (pendingId: string) => Promise<void>,
): Promise<void> {
  if (!__DEV__) return

  for (const credential of readStoredCredentials()) {
    const renewal = readCredentialRenewal(credential.id)
    if (renewal?.state !== 'renewal-processing') continue
    if (serverCredentialIds.has(credential.id)) continue
    // Local ready marker means the Holder can still Receive — do not demote to
    // renewal-required on a transient empty/mismatched server list.
    if (renewal.readyOfferUri?.trim()) continue

    await discardPendingRenewalKey(renewal.pendingCredentialKeyId, discardPending)
    upsertCredentialRenewal(
      credential.id,
      {
        previousHolderDid: renewal.previousHolderDid,
        readyOfferUri: undefined,
        pendingCredentialKeyId: undefined,
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
  let statusPollSucceeded = false

  try {
    const response = await resolvedDependencies.fetchImpl(DEV_RENEWAL_STATUS_ENDPOINT)
    if (!response.ok) {
      logWalletError('renewal', 'status-poll-non-ok', new Error(`HTTP ${response.status}`))
      return
    }

    const payload = (await response.json()) as Partial<RenewalStatusPayload>
    if (!Array.isArray(payload.renewals)) return

    statusPollSucceeded = true
    serverCredentialIds = new Set(
      payload.renewals
        .map((renewal) => renewal.credentialId)
        .filter((credentialId): credentialId is string => typeof credentialId === 'string'),
    )

    for (const renewal of payload.renewals) {
      const current = readCredentialRenewal(renewal.credentialId)
      if (!current) continue

      if (renewal.state === 'offer-ready') {
        const readyOfferUri = typeof renewal.offerUri === 'string' ? renewal.offerUri.trim() : ''
        // Persist a usable offer URI for the manual Receive CTA. Do not clear an
        // existing marker when the server omits/blanks offerUri — remount/poll
        // must not replace Receive with a document-expired Scan path.
        if (
          current.state === 'renewal-processing' &&
          readyOfferUri &&
          current.readyOfferUri !== readyOfferUri
        ) {
          upsertCredentialRenewal(
            renewal.credentialId,
            {
              ...current,
              readyOfferUri,
            },
            new Date(),
          )
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
    // Only orphan after a successful status payload. A failed poll used to pass
    // an empty id set through finally and wipe every ready Receive CTA.
    if (statusPollSucceeded) {
      await recoverOrphanedRenewalProcessing(
        serverCredentialIds,
        resolvedDependencies.discardPendingHardwareCredentialKey ?? (async () => undefined),
      )
    }
    repairInconsistentRenewalPairs()
  }
}

export async function claimReadyRenewal(
  credentialId: string,
  dependencies: Partial<RenewalServiceDependencies> = {},
): Promise<void> {
  if (renewalClaimsInFlight.has(credentialId)) return

  const current = readCredentialRenewal(credentialId)
  if (!current || current.state !== 'renewal-processing') return

  const resolvedDependencies = resolveDependencies(dependencies)
  renewalClaimsInFlight.add(credentialId)
  try {
    let readyRenewal: RenewalStatusPayload['renewals'][number] | undefined
    try {
      const response = await resolvedDependencies.fetchImpl(DEV_RENEWAL_STATUS_ENDPOINT)
      if (!response.ok) {
        throw new Error(`CredentialRenewalStatusFailed: HTTP ${response.status}`)
      }

      const payload = (await response.json()) as Partial<RenewalStatusPayload>
      if (!Array.isArray(payload.renewals)) {
        throw new Error('CredentialRenewalStatusMalformed: renewals array is required')
      }

      readyRenewal = payload.renewals.find(
        (renewal) =>
          renewal.credentialId === credentialId &&
          renewal.state === 'offer-ready' &&
          typeof renewal.offerUri === 'string' &&
          renewal.offerUri.trim().length > 0,
      )
    } catch (error) {
      clearReadyOfferUri(credentialId)
      logWalletError('renewal', 'status-refresh-failed', error, { credentialId })
      throw error
    }

    const latest = readCredentialRenewal(credentialId)
    if (!latest || latest.state !== 'renewal-processing') return

    const readyOfferUri = readyRenewal?.offerUri?.trim()
    if (!readyOfferUri) {
      if (latest.readyOfferUri) {
        upsertCredentialRenewal(
          credentialId,
          {
            ...latest,
            readyOfferUri: undefined,
          },
          new Date(),
        )
      }
      return
    }

    if (latest.readyOfferUri !== readyOfferUri) {
      upsertCredentialRenewal(
        credentialId,
        {
          ...latest,
          readyOfferUri,
        },
        new Date(),
      )
    }

    await completeRenewalClaim(credentialId, readyOfferUri, resolvedDependencies)
  } finally {
    renewalClaimsInFlight.delete(credentialId)
  }
}

/** @deprecated Use submitRenewalRequest followed by an explicit claimReadyRenewal call. */
export async function requestCredentialRenewal(
  _credentialId: string,
  _dependencies: Partial<RenewalServiceDependencies> = {},
): Promise<VerifiableCredentialRecord> {
  throw new Error('CredentialRenewalManualReceiveRequired')
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

export async function confirmOldCredentialCleanup(credentialId: string): Promise<void> {
  const oldRenewal = readCredentialRenewal(credentialId)
  const replacementCredentialId = oldRenewal?.replacementCredentialId
  logWalletStep('credentials', 'confirm-old-cleanup-start', {
    credentialId,
    replacementCredentialId,
    oldRenewalState: oldRenewal?.state,
  })

  purgeCredentialStorageKeys(credentialId)
  await destroyIssuanceCredentialKey(credentialId).catch((error) => {
    logWalletError('credentials', 'destroy-old-credential-key-failed', error, { credentialId })
  })

  if (replacementCredentialId) {
    clearCredentialRenewal(replacementCredentialId)
  }

  const remainingCredentials = readStoredCredentials()
  const stillPresent = remainingCredentials.some((credential) => credential.id === credentialId)
  const hasPendingRenewalWork = remainingCredentials.some((credential) => {
    const renewal = readCredentialRenewal(credential.id)
    if (!renewal) return false

    return isRenewalAwaitingHolderCleanup(renewal) || renewal.state === 'renewal-required' || renewal.state === 'renewal-processing'
  })
  if (!hasPendingRenewalWork) {
    await clearWalletKeyRotationRecord()
  }

  notifyCredentialsChanged()
  logWalletStep('credentials', 'confirm-old-cleanup-complete', {
    credentialId,
    stillPresentAfterRemoval: stillPresent,
    remainingCredentialCount: remainingCredentials.length,
  })
}

export async function refreshCredentialRenewalStatuses(
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await refreshAndCompleteRenewals({ fetchImpl })
}
