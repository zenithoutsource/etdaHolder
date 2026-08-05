import * as Linking from 'expo-linking'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from './AppButton'
import { FacePreparePanel } from './FacePreparePanel'
import { PresentationDocumentUnavailablePanel } from './PresentationDocumentUnavailablePanel'
import { PresentationConsentPanel, readInitialSelectedClaimKeys, readSelectedDisclosureLabels } from './PresentationConsentPanel'
import { PresentationInfoPanel } from './PresentationInfoPanel'
import { PresentationResultPanel } from './PresentationResultPanel'
import { PresentationStepScaffold } from './PresentationStepScaffold'
import { TRUSTED_VERIFIERS } from '../config/trustedVerifiers'
import { getCardSchema } from '../config/cardSchemas'
import { filterPresentableCredentials } from '../services/credentials/credentialLifecycle'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import { recordSuccessfulPresentation } from '../services/history/presentationHistory'
import { appendWalletHistoryEvent } from '../services/history/walletEventLog'
import { recordWalletPresentationSuccess } from '../services/history/recordWalletPresentationSuccess'
import { recordOid4vpPresentationFailure, recordWalletInitiatedPresentationFailure } from '../services/history/walletHistoryRecording'
import { maybeConsumeSingleUseCredential } from '../services/credentials/singleUseCredentialConsumption'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { toFriendlyError } from '../services/scan/scanFriendlyErrors'
import { describePresentationForLog } from '../services/scan/scanLogDescriptors'
import { confirmPresentationBiometric, createApprovedPresentationResponse } from '../services/vp/presentationApproval'
import { markPresentationRequestConsumed } from '../services/vp/presentationRequestReplay'
import type { PresentationFlowOrigin } from '../services/vp/oid4vc/types'
import {
  readPresentationTokenMode,
  resolvePresentationRequest,
  submitPresentationResponse,
  type ResolvedPresentationRequest,
} from '../services/vp/presentationService'
import {
  readPresentationUnavailableDetails,
  type PresentationUnavailableDetails,
} from '../services/vp/presentationUnavailable'
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
  | { tag: 'documentUnavailable'; details: PresentationUnavailableDetails }
  | { tag: 'facePrepare'; request: ResolvedPresentationRequest }
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
  onDone: () => void
  onCancel: () => void
}

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
  onDone,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<FlowPhase>({ tag: 'resolving' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedClaimKeys, setSelectedClaimKeys] = useState<Set<string>>(() => new Set())
  const generationRef = useRef(0)
  const credentialsRef = useRef(credentials)
  credentialsRef.current = credentials
  const presentableCredentialKey = JSON.stringify(
    filterPresentableCredentials(credentials).map((record) => record.id),
  )

  useEffect(() => {
    const gen = ++generationRef.current
    setPhase({ tag: 'resolving' })

    void (async () => {
      try {
        const presentableCredentials = filterPresentableCredentials(credentialsRef.current)
        logWalletStep(logScope, 'presentation-credentials-loaded', {
          presentableCount: presentableCredentials.length,
        })
        const request = await withTimeout(
          resolvePresentationRequest(authorizationRequestUri, presentableCredentials, {
            trustedVerifiers: TRUSTED_VERIFIERS,
            presentationFlowOrigin,
          }),
          RESOLVE_TIMEOUT_MS,
          `${logScope}Timeout: resolving presentation request timed out`,
        )
        logWalletStep(logScope, 'presentation-resolved', describePresentationForLog(request))
        if (generationRef.current === gen) setPhase({ tag: 'facePrepare', request })
      } catch (err) {
        if (generationRef.current !== gen) return
        logWalletError(logScope, 'presentation-resolve-failed', err)
        const unavailableDetails = readPresentationUnavailableDetails(err)
        if (unavailableDetails) {
          setPhase({ tag: 'documentUnavailable', details: unavailableDetails })
          return
        }
        const raw = err instanceof Error ? err.message : String(err)
        setPhase({ tag: 'error', message: toFriendlyError(raw) })
      }
    })()

    return () => {
      generationRef.current++
    }
  }, [authorizationRequestUri, logScope, presentationFlowOrigin, presentableCredentialKey])

  const confirmFacePrepare = useCallback((request: ResolvedPresentationRequest) => {
    setSelectedClaimKeys(readInitialSelectedClaimKeys(request.disclosures))
    setPhase({ tag: 'consent', request })
  }, [])

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
        recordSuccessfulPresentation({
          credentialId: request.matchedCredential.id,
          credentialType: request.matchedCredential.type,
          verifierName: request.verifier.name,
          documentType: getCardSchema(request.matchedCredential.type).title,
          disclosedClaims: disclosedLabels,
        })
      } else {
        recordWalletPresentationSuccess({
          credentialId: request.matchedCredential.id,
          documentType: getCardSchema(request.matchedCredential.type).title,
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

      if (generationRef.current === gen) {
        setPhase({ tag: 'success', verifierName: request.verifier.name })
      }
    } catch (err) {
      logWalletError(logScope, 'presentation-approve-failed', err)
      if (historyChannel === 'oid4vp') {
        recordOid4vpPresentationFailure(request, err, disclosedLabels)
      } else {
        recordWalletInitiatedPresentationFailure({
          record: request.matchedCredential,
          disclosedClaims: disclosedLabels,
        })
      }
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    } finally {
      setIsSubmitting(false)
    }
  }, [historyChannel, isSubmitting, logScope])

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
      documentType: getCardSchema(request.matchedCredential.type).title,
      partyName: request.verifier.name,
      disclosedClaims,
      channel: historyChannel,
    })
    onCancel()
  }, [historyChannel, logScope, onCancel])

  if (phase.tag === 'facePrepare') {
    return (
      <PresentationStepScaffold onBack={onCancel}>
        <FacePreparePanel onScan={() => confirmFacePrepare(phase.request)} />
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
      <PresentationStepScaffold title="Verifier" onBack={onDone}>
        <PresentationResultPanel verifierName={phase.verifierName} onDone={onDone} />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'documentUnavailable') {
    const requestCredentialType = phase.details.requestCredentialType
    return (
      <PresentationStepScaffold title="Wallet" onBack={onCancel}>
        <PresentationDocumentUnavailablePanel
          documentLabel={phase.details.documentLabel}
          presentationOrigin={presentationOrigin}
          onBack={onCancel}
          onRequest={
            requestCredentialType && onRequestCredential
              ? () => onRequestCredential(requestCredentialType)
              : undefined
          }
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'error') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
        <Text className="mb-5 text-center text-[14px] text-red-600">{phase.message}</Text>
        <AppButton
          variant="solid-block"
          label="ลองอีกครั้ง"
          onPress={onCancel}
          className="rounded-xl px-[18px] py-[14px]"
          textClassName="text-[15px] font-semibold"
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-surface-soft p-6">
      <Text className="text-center text-sm text-gray600">กำลังเปิดการสำแดง…</Text>
    </SafeAreaView>
  )
}
