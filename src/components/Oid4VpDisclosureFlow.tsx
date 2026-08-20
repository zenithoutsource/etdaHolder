/**
 * OID4VP orchestrator — resolve, face/consent/issuer-PID, info, submit, success/fail.
 * Journey: P4 (PresentationRequestScreen and My QR).
 * Copy: presentationFailureUi, issuerPidPresentationCopy, cardSchemas labels.
 * Layout: FacePreparePanel, consent/info/issuer-PID panels, result/failure.
 * Next: Wallet on Back/cancel; Done may resume same-device claim.
 * Map: docs/CODEMAPS/frontend.md#oid4vp-request
 */

import * as Linking from 'expo-linking'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'


import { FacePreparePanel } from './FacePreparePanel'
import { IssuerPidPresentationPanel } from './IssuerPidPresentationPanel'
import { PresentationFailurePanel } from './PresentationFailurePanel'
import { PresentationConsentPanel, readInitialSelectedClaimKeys, readSelectedDisclosureLabels } from './PresentationConsentPanel'
import { PresentationInfoPanel } from './PresentationInfoPanel'
import { PresentationResultPanel } from './PresentationResultPanel'
import { PresentationStepScaffold } from './PresentationStepScaffold'
import { TRUSTED_VERIFIERS } from '../config/trustedVerifiers'
import { readHistoryDocumentLabel } from '../config/historyDisplayNames'
import { readPresentationVerifierDisplayName } from '../config/presentationVerifierMocks'
import { filterPresentableCredentials } from '../services/credentials/credentialLifecycle'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import { recordSuccessfulPresentation } from '../services/history/presentationHistory'
import { mapPresentationFlowOriginToDeliveryPath } from '../services/history/historyDeliveryPath'
import { appendWalletHistoryEvent } from '../services/history/walletEventLog'
import { recordWalletPresentationSuccess } from '../services/history/recordWalletPresentationSuccess'
import { recordOid4vpPresentationFailure, recordWalletInitiatedPresentationFailure } from '../services/history/walletHistoryRecording'
import { maybeConsumeSingleUseCredential } from '../services/credentials/singleUseCredentialConsumption'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { describePresentationForLog } from '../services/scan/scanLogDescriptors'
import { confirmPresentationBiometric, createApprovedPresentationResponse } from '../services/vp/presentationApproval'
import { markPresentationRequestConsumed } from '../services/vp/presentationRequestReplay'
import type { PresentationFlowOrigin } from '../services/vp/oid4vc/types'
import {
  readPresentationTokenMode,
  submitPresentationResponse,
  type ResolvedPresentationRequest,
} from '../services/vp/presentationService'
import { resolvePresentationRequestCached } from '../services/vp/presentationResolveCache'
import { resolvePresentationFailureUi, type PresentationFailureUi } from '../services/vp/presentationFailureUi'
import { isIssuerPidPresentation } from '../services/vp/isIssuerPidPresentation'
import type { IssuerPortalCredentialType } from '../config/issuerPortalUrls'

const RESOLVE_TIMEOUT_MS = 20_000
const PRESENT_TIMEOUT_MS = 30_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

type FlowPhase =
  | { tag: 'resolving' }
  | { tag: 'failure'; details: PresentationFailureUi }
  | { tag: 'facePrepare'; request: ResolvedPresentationRequest }
  | { tag: 'issuerPidConsent'; request: ResolvedPresentationRequest }
  | { tag: 'consent'; request: ResolvedPresentationRequest }
  | { tag: 'info'; request: ResolvedPresentationRequest }
  | { tag: 'success'; verifierName: string }
  | { tag: 'error'; message: string }

type Props = {
  authorizationRequestUri: string
  credentials: VerifiableCredentialRecord[]
  historyChannel?: 'oid4vp' | 'wallet'
  logScope?: 'presentation-request' | 'my-qr'
  presentationOrigin?: 'scanned-verifier-qr' | 'wallet-generated-qr'
  presentationFlowOrigin?: PresentationFlowOrigin
  onRequestCredential?: (credentialType: IssuerPortalCredentialType) => void
  /** Fired when the request itself is dead (expired/invalid) so the host can dismiss the deeplink. */
  onTerminalFailure?: (details: PresentationFailureUi) => void
  onDone: () => void
  onCancel: () => void
  /** Fired when submit succeeds, before the holder leaves the success panel. */
  onSucceeded?: () => void
}

const TERMINAL_REQUEST_FAILURE_KINDS = new Set<PresentationFailureUi['kind']>([
  'request-expired',
  'request-unreachable',
  'request-invalid',
  'request-unsupported',
  'replay-blocked',
])

/**
 * Shared OID4VP disclosure UX. Reuses the same consent/face/info/result panels for
 * Verifier-initiated (oid4vp) and wallet-initiated (My QR) presentation flows.
 */
export function Oid4VpDisclosureFlow({
  authorizationRequestUri,
  credentials,
  historyChannel = 'wallet',
  logScope = 'my-qr',
  presentationOrigin = 'wallet-generated-qr',
  presentationFlowOrigin = 'my-qr',
  onRequestCredential,
  onTerminalFailure,
  onDone,
  onCancel,
  onSucceeded,
}: Props) {
  const [phase, setPhase] = useState<FlowPhase>({ tag: 'resolving' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedClaimKeys, setSelectedClaimKeys] = useState<Set<string>>(() => new Set())
  const generationRef = useRef(0)
  // Once resolve succeeds (or submit finishes), ignore presentable-credential churn so a
  // post-submit credentials refresh cannot reset the UI back to the loading spinner.
  const flowLockedRef = useRef(false)
  const credentialsRef = useRef(credentials)
  credentialsRef.current = credentials
  const presentableCredentialKey = JSON.stringify(
    filterPresentableCredentials(credentials).map((record) => record.id),
  )

  useEffect(() => {
    flowLockedRef.current = false
  }, [authorizationRequestUri])

  useEffect(() => {
    if (flowLockedRef.current) return

    const gen = ++generationRef.current
    setPhase({ tag: 'resolving' })

    void (async () => {
      try {
        const walletCredentials = credentialsRef.current
        const presentableCredentials = filterPresentableCredentials(walletCredentials)
        logWalletStep(logScope, 'presentation-credentials-loaded', {
          presentableCount: presentableCredentials.length,
        })
        const request = await withTimeout(
          resolvePresentationRequestCached(
            authorizationRequestUri,
            presentableCredentialKey,
            presentableCredentials,
            {
              trustedVerifiers: TRUSTED_VERIFIERS,
              presentationFlowOrigin,
              walletCredentials,
            },
          ),
          RESOLVE_TIMEOUT_MS,
          `${logScope}Timeout: resolving presentation request timed out`,
        )
        logWalletStep(logScope, 'presentation-resolved', describePresentationForLog(request))
        if (generationRef.current !== gen) return
        flowLockedRef.current = true
        if (isIssuerPidPresentation(request)) {
          setSelectedClaimKeys(readInitialSelectedClaimKeys(request.disclosures))
          setPhase({ tag: 'issuerPidConsent', request })
          return
        }
        setPhase({ tag: 'facePrepare', request })
      } catch (err) {
        if (generationRef.current !== gen) return
        logWalletError(logScope, 'presentation-resolve-failed', err)
        const details = resolvePresentationFailureUi(err)
        setPhase({ tag: 'failure', details })
        if (TERMINAL_REQUEST_FAILURE_KINDS.has(details.kind)) {
          onTerminalFailure?.(details)
        }
      }
    })()

    return () => {
      generationRef.current++
    }
  }, [authorizationRequestUri, logScope, onTerminalFailure, presentationFlowOrigin, presentableCredentialKey])

  const confirmFacePrepare = useCallback((request: ResolvedPresentationRequest) => {
    setSelectedClaimKeys(readInitialSelectedClaimKeys(request.disclosures))
    setPhase({ tag: 'consent', request })
  }, [])

  const deliveryPath = mapPresentationFlowOriginToDeliveryPath(
    historyChannel === 'oid4vp' ? presentationFlowOrigin : undefined,
  )

  const approvePresentation = useCallback(async (
    request: ResolvedPresentationRequest,
    holderSelectedClaimKeys: ReadonlySet<string>,
  ) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    const gen = generationRef.current
    const disclosedLabels = readSelectedDisclosureLabels(
      request.disclosures,
      holderSelectedClaimKeys,
      request.matchedCredential.type,
    )
    try {
      logWalletStep(logScope, 'presentation-approve-start', describePresentationForLog(request))
      if (readPresentationTokenMode(request) === 'raw-credential') {
        logWalletStep(logScope, 'presentation-biometric-start', describePresentationForLog(request))
        await confirmPresentationBiometric()
        logWalletStep(logScope, 'presentation-biometric-complete', describePresentationForLog(request))
      }
      const { vpToken, presentationSubmission } = await createApprovedPresentationResponse(request, {
        selectedClaimKeys: [...holderSelectedClaimKeys],
      })
      const response = await withTimeout(
        submitPresentationResponse(request, { vpToken, presentationSubmission }),
        PRESENT_TIMEOUT_MS,
        `${logScope}Timeout: presenting credential timed out`,
      )
      logWalletStep(logScope, 'presentation-submit-complete', {
        ...describePresentationForLog(request),
        responseStatus: response.status,
      })
      markPresentationRequestConsumed({
        requestUri: request.requestUri,
        nonce: request.nonce,
      })

      if (historyChannel === 'oid4vp') {
        const verifierDisplayName = readPresentationVerifierDisplayName(
          request.matchedCredential.type,
          request.verifier.name,
        )
        recordSuccessfulPresentation({
          credentialId: request.matchedCredential.id,
          credentialType: request.matchedCredential.type,
          verifierName: verifierDisplayName,
          documentType: readHistoryDocumentLabel({
            credentialType: request.matchedCredential.type,
          }),
          disclosedClaims: disclosedLabels,
          ...(deliveryPath ? { deliveryPath } : {}),
        })
      } else {
        recordWalletPresentationSuccess({
          credentialId: request.matchedCredential.id,
          documentType: readHistoryDocumentLabel({
            credentialType: request.matchedCredential.type,
          }),
          partyName: request.verifier.name,
          disclosedClaims: disclosedLabels,
          channel: 'wallet',
        })
        maybeConsumeSingleUseCredential({
          credentialId: request.matchedCredential.id,
          credentialType: request.matchedCredential.type,
        })
      }
      logWalletStep(logScope, 'presentation-history-recorded', describePresentationForLog(request))

      if (historyChannel === 'oid4vp' && response.redirectUri) {
        logWalletStep(logScope, 'presentation-return-uri-open', {
          ...describePresentationForLog(request),
          returnUriOrigin: new URL(response.redirectUri).origin,
        })
        void Linking.openURL(response.redirectUri)
      }

      // Always show success after a completed submit — credential-list churn may have
      // bumped generationRef via the resolve-effect cleanup even while the flow is locked.
      flowLockedRef.current = true
      setPhase({
        tag: 'success',
        verifierName: readPresentationVerifierDisplayName(
          request.matchedCredential.type,
          request.verifier.name,
        ),
      })
      onSucceeded?.()
    } catch (err) {
      logWalletError(logScope, 'presentation-approve-failed', err)
      if (historyChannel === 'oid4vp') {
        recordOid4vpPresentationFailure(request, err, disclosedLabels, deliveryPath)
      } else {
        recordWalletInitiatedPresentationFailure({
          record: request.matchedCredential,
          disclosedClaims: disclosedLabels,
        })
      }
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) {
        setPhase({ tag: 'failure', details: resolvePresentationFailureUi(err) })
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [deliveryPath, historyChannel, isSubmitting, logScope, onSucceeded])

  const declinePresentation = useCallback((
    request: ResolvedPresentationRequest,
    holderSelectedKeys?: ReadonlySet<string>,
  ) => {
    logWalletStep(logScope, 'presentation-user-declined', describePresentationForLog(request))
    const disclosedClaims = holderSelectedKeys
      ? readSelectedDisclosureLabels(
          request.disclosures,
          holderSelectedKeys,
          request.matchedCredential.type,
        )
      : []

    appendWalletHistoryEvent({
      kind: 'presentation-declined',
      credentialId: request.matchedCredential.id,
      documentType: readHistoryDocumentLabel({
        credentialType: request.matchedCredential.type,
      }),
      partyName: historyChannel === 'oid4vp'
        ? readPresentationVerifierDisplayName(
            request.matchedCredential.type,
            request.verifier.name,
          )
        : request.verifier.name,
      disclosedClaims,
      channel: historyChannel,
      ...(historyChannel === 'oid4vp'
        ? {
            credentialType: request.matchedCredential.type,
            ...(deliveryPath ? { deliveryPath } : {}),
          }
        : {
            credentialType: request.matchedCredential.type,
          }),
    })
    onCancel()
  }, [deliveryPath, historyChannel, logScope, onCancel])

  if (phase.tag === 'facePrepare') {
    return (
      <PresentationStepScaffold onBack={onCancel}>
        <FacePreparePanel onScan={() => confirmFacePrepare(phase.request)} />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'issuerPidConsent') {
    return (
      <PresentationStepScaffold onBack={onCancel}>
        <IssuerPidPresentationPanel
          record={phase.request.matchedCredential}
          submitting={isSubmitting}
          onConfirm={() => {
            logWalletStep(logScope, 'presentation-user-accepted', describePresentationForLog(phase.request))
            void approvePresentation(phase.request, selectedClaimKeys)
          }}
          onDecline={() => declinePresentation(phase.request)}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'consent') {
    return (
      <PresentationStepScaffold onBack={onCancel}>
        <PresentationConsentPanel
          request={phase.request}
          onAccept={() => {
            logWalletStep(logScope, 'presentation-consent-acknowledged', describePresentationForLog(phase.request))
            setSelectedClaimKeys(readInitialSelectedClaimKeys(phase.request.disclosures))
            setPhase({ tag: 'info', request: phase.request })
          }}
          onReject={() => declinePresentation(phase.request)}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'info') {
    return (
      <PresentationStepScaffold title="Wallet" onBack={() => declinePresentation(phase.request, selectedClaimKeys)}>
        <PresentationInfoPanel
          request={phase.request}
          selectedClaimKeys={selectedClaimKeys}
          onToggleClaim={(claimKey) => {
            setSelectedClaimKeys((previous) => {
              const next = new Set(previous)
              if (next.has(claimKey)) next.delete(claimKey)
              else next.add(claimKey)
              return next
            })
          }}
          onConfirm={() => {
            logWalletStep(logScope, 'presentation-user-accepted', describePresentationForLog(phase.request))
            void approvePresentation(phase.request, selectedClaimKeys)
          }}
          submitting={isSubmitting}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'success') {
    return (
      <PresentationStepScaffold title="Verifier" onBack={onCancel}>
        <PresentationResultPanel verifierName={phase.verifierName} onDone={onDone} />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'failure') {
    const requestCredentialType = phase.details.requestCredentialType
    const showRequestButton = phase.details.showRequestButton
    return (
      <PresentationStepScaffold title="Wallet" onBack={onCancel}>
        <PresentationFailurePanel
          {...phase.details}
          presentationOrigin={presentationOrigin}
          onBack={onCancel}
          onRequest={
            showRequestButton && requestCredentialType && onRequestCredential
              ? () => onRequestCredential(requestCredentialType)
              : undefined
          }
        />
      </PresentationStepScaffold>
    )
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
      <Text className="text-center text-sm text-gray600">กำลังเปิดการสำแดง…</Text>
    </SafeAreaView>
  )
}
