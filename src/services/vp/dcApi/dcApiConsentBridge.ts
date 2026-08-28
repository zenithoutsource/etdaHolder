/**
 * Startup bridge from native DC API provider events to consent routing and registry sync.
 */
import type { Href } from 'expo-router'
import { Platform } from 'react-native'
import type { Router } from 'expo-router'

import { TRUSTED_VERIFIERS } from '@/src/config/trustedVerifiers'
import { getCardSchema } from '@/src/config/cardSchemas'
import { readStoredCredentials } from '@/src/services/credentials/storedCredentials'
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'
import {
  ensureNativeMdocStored,
  enumeratePresentableMdocCredentials,
  readMdocDocTypeFromRecord,
} from '@/src/services/proximity/mdocCredential'
import { readWalletPinLockRequired } from '@/src/services/auth/walletPinNavigation'
import { useDcApiPresentationStore } from '@/src/store/dcApiPresentationStore'

import {
  buildDcApiRegistryFields,
  DC_API_MDL_DOCTYPE,
  isDcApiMdocCredential,
} from './dcApiRegistryFields'
import { normalizePlatformDcApiEvent } from './dcApiCrossDevice'
import {
  cancelDcApiSession,
  isDcApiRegistryPayloadSyncAvailable,
  isNativeDcApiProviderAvailable,
  pullPendingDcApiPresentationRequests,
  subscribeToDcApiPresentationRequests,
  syncDcApiRegistry,
  type DcApiRegistryCredential,
  type DcApiPresentationRequestEvent,
} from './nativeDcApiProviderModule'

import { resolveDcApiPresentation } from './dcApiPresentationService'
import { PresentationCredentialUnavailableError } from '../presentationUnavailable'

let unsubscribePresentationRequests: (() => void) | null = null
let pendingPullTimers: ReturnType<typeof setTimeout>[] = []

function clearPendingPullTimers(): void {
  for (const timer of pendingPullTimers) clearTimeout(timer)
  pendingPullTimers = []
}

export function startDcApiProviderBridge(router: Router): () => void {
  if (Platform.OS !== 'android' || !isNativeDcApiProviderAvailable()) {
    return () => undefined
  }

  unsubscribePresentationRequests?.()
  unsubscribePresentationRequests = subscribeToDcApiPresentationRequests((event) => {
    void handleIncomingDcApiRequest(event, router)
  })

  void pullAndHandlePendingDcApiRequests(router, 'bridge-start')
  clearPendingPullTimers()
  for (const delayMs of [250, 750, 2000]) {
    pendingPullTimers.push(
      setTimeout(() => {
        void pullAndHandlePendingDcApiRequests(router, `bridge-retry-${delayMs}ms`)
      }, delayMs),
    )
  }

  return () => {
    clearPendingPullTimers()
    unsubscribePresentationRequests?.()
    unsubscribePresentationRequests = null
  }
}

export async function pullAndHandlePendingDcApiRequests(
  router: Router,
  reason: string,
): Promise<void> {
  if (Platform.OS !== 'android' || !isNativeDcApiProviderAvailable()) return

  try {
    const pending = await pullPendingDcApiPresentationRequests()
    if (pending.length === 0) return

    logWalletStep('dc-api-provider', 'pending-presentation-requests-pulled', {
      reason,
      count: pending.length,
    })

    for (const event of pending) {
      await handleIncomingDcApiRequest(event, router)
    }
  } catch (error) {
    logWalletError('dc-api-provider', 'pending-presentation-pull-failed', error, { reason })
  }
}

export async function syncDcApiRegistryFromCredentials(
  credentials: VerifiableCredentialRecord[],
): Promise<{ registeredCount: number; presentableMdocCount: number }> {
  if (Platform.OS !== 'android' || !isNativeDcApiProviderAvailable()) {
    logWalletStep('dc-api-provider', 'registry-sync-unavailable', {
      platform: Platform.OS,
      nativeModuleAvailable: isNativeDcApiProviderAvailable(),
    })
    return { registeredCount: 0, presentableMdocCount: 0 }
  }

  if (!isDcApiRegistryPayloadSyncAvailable()) {
    logWalletStep('dc-api-provider', 'registry-sync-unavailable', {
      platform: Platform.OS,
      nativeModuleAvailable: true,
      reason: 'native-rebuild-required',
    })
    return { registeredCount: 0, presentableMdocCount: 0 }
  }

  const presentableCredentials = await enumeratePresentableMdocCredentials(credentials)
  const mdlCredentials = presentableCredentials.filter((credential) =>
    isDcApiMdocCredential(credential),
  )

  if (mdlCredentials.length === 0) {
    logWalletStep('dc-api-provider', 'registry-sync-skipped', {
      storedCredentialCount: credentials.length,
      presentableMdocCount: presentableCredentials.length,
      mdlCredentialCount: 0,
    })
    return { registeredCount: 0, presentableMdocCount: presentableCredentials.length }
  }

  const entries: DcApiRegistryCredential[] = []
  for (const credential of mdlCredentials) {
    await ensureNativeMdocStored(credential)
    const fields = await buildDcApiRegistryFields(credential)
    if (fields.length === 0) {
      logWalletStep('dc-api-provider', 'registry-entry-skipped-empty-fields', {
        credentialId: credential.id,
        docType: readMdocDocTypeFromRecord(credential),
      })
      continue
    }
    if (!fields.some((field) => field.identifier === 'family_name')
      || !fields.some((field) => field.identifier === 'given_name')) {
      logWalletStep('dc-api-provider', 'registry-entry-skipped-required-names-missing', {
        credentialId: credential.id,
        identifiers: fields.map((field) => field.identifier),
      })
      continue
    }
    const entry = readRegistryCredentialEntry(credential, fields)
    if (entry) entries.push(entry)
  }

  if (entries.length === 0) {
    logWalletStep('dc-api-provider', 'registry-sync-skipped', {
      storedCredentialCount: credentials.length,
      presentableMdocCount: presentableCredentials.length,
      mdlCredentialCount: mdlCredentials.length,
      reason: 'no-mdl-fields',
    })
    return { registeredCount: 0, presentableMdocCount: presentableCredentials.length }
  }

  try {
    const registeredCount = await syncDcApiRegistry(entries)
    if (registeredCount === 0 && entries.length > 0) {
      logWalletStep('dc-api-provider', 'registry-native-sync-empty', {
        jsEntryCount: entries.length,
        fieldCounts: entries.map((entry) => ({
          credentialId: entry.credentialId,
          fieldCount: entry.fields.length,
          identifiers: entry.fields.map((field) => field.identifier),
        })),
      })
    }
    logWalletStep('dc-api-provider', 'registry-synced', {
      registeredCount,
      presentableMdocCount: presentableCredentials.length,
      mdlCredentialCount: mdlCredentials.length,
      fieldCounts: entries.map((entry) => ({
        credentialId: entry.credentialId,
        fieldCount: entry.fields.length,
        identifiers: entry.fields.map((field) => field.identifier),
      })),
    })
    return { registeredCount, presentableMdocCount: presentableCredentials.length }
  } catch (error) {
    logWalletError('dc-api-provider', 'registry-sync-failed', error)
    throw error
  }
}

async function handleIncomingDcApiRequest(
  event: DcApiPresentationRequestEvent,
  router: Router,
): Promise<void> {
  const currentPhase = useDcApiPresentationStore.getState().phase
  if (
    currentPhase.tag !== 'idle'
    && currentPhase.tag !== 'finished'
    && currentPhase.sessionId === event.sessionId
  ) {
    return
  }
  if (
    currentPhase.tag !== 'idle'
    && currentPhase.tag !== 'finished'
    && currentPhase.sessionId !== event.sessionId
  ) {
    try {
      await cancelDcApiSession(currentPhase.sessionId, 'superseded-by-new-request')
    } catch (error) {
      logWalletError('dc-api-provider', 'cancel-superseded-session-failed', error, {
        supersededSessionId: currentPhase.sessionId,
        nextSessionId: event.sessionId,
      })
    }
  }

  let normalized
  try {
    normalized = normalizePlatformDcApiEvent(event)
  } catch (error) {
    logWalletError('dc-api-provider', 'incoming-request-normalize-failed', error)
    return
  }

  useDcApiPresentationStore.getState().queueIncomingRequest({
    sessionId: normalized.sessionId,
    protocol: normalized.protocol,
    origin: normalized.origin,
    request: normalized.request,
    transport: normalized.transport,
    selectedCredentialId: normalized.selectedCredentialId,
  })

  logWalletStep('dc-api-provider', 'incoming-presentation-request', {
    sessionId: event.sessionId,
    origin: event.origin,
    protocol: event.protocol,
    transport: normalized.transport,
    pinLockRequired: readWalletPinLockRequired(),
  })

  if (readWalletPinLockRequired()) {
    router.replace('/pin-lock' as Href)
    return
  }

  router.push('/dc-api-presentation' as Href)
}

function readRegistryCredentialEntry(
  record: VerifiableCredentialRecord,
  fields: DcApiRegistryCredential['fields'],
): DcApiRegistryCredential | null {
  if (fields.length === 0) return null

  const docType = readMdocDocTypeFromRecord(record)
  if (docType !== DC_API_MDL_DOCTYPE) return null

  const schema = getCardSchema(record.type)
  return {
    credentialId: record.id,
    docType,
    displayName: schema.title,
    fields,
  }
}

export async function resolveQueuedDcApiPresentation(): Promise<void> {
  const phase = useDcApiPresentationStore.getState().phase
  if (phase.tag === 'ready' || phase.tag === 'completing' || phase.tag === 'finished') {
    return
  }
  if (phase.tag !== 'pending') return

  const sessionId = phase.sessionId
  const credentials = readStoredCredentials()
  if (credentials.length === 0) {
    logWalletStep('dc-api-provider', 'resolve-deferred-empty-credentials', {
      sessionId: phase.sessionId,
    })
    throw new PresentationCredentialUnavailableError({
      message: 'PresentationCredentialMissing: wallet credentials are not loaded yet',
      reason: 'credential-missing',
      matchFailureKind: 'document-not-stored',
    })
  }

  try {
    await syncDcApiRegistryFromCredentials(credentials)
    const resolved = await resolveDcApiPresentation(
      {
        sessionId: phase.sessionId,
        protocol: phase.protocol,
        origin: phase.origin,
        request: phase.request,
      },
      credentials,
      {
        trustedVerifiers: TRUSTED_VERIFIERS,
        preferredCredentialId: phase.selectedCredentialId,
      },
    )
    const latestPhase = useDcApiPresentationStore.getState().phase
    if (latestPhase.tag === 'ready' && latestPhase.sessionId === sessionId) {
      logWalletStep('dc-api-provider', 'resolve-already-ready', { sessionId })
      return
    }
    if (latestPhase.tag !== 'pending' || latestPhase.sessionId !== sessionId) {
      logWalletStep('dc-api-provider', 'resolve-stale-session-ignored', {
        resolvedSessionId: sessionId,
        latestPhase: latestPhase.tag,
        latestSessionId:
          latestPhase.tag === 'idle'
            ? null
            : latestPhase.sessionId,
      })
      return
    }
    useDcApiPresentationStore.getState().setResolvedPresentation(resolved)
  } catch (error) {
    logWalletError('dc-api-provider', 'resolve-failed', error)
    throw error
  }
}
