import { useCallback, useEffect, useRef, useState } from 'react'
import { Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from './AppButton'
import { FacePreparePanel } from './FacePreparePanel'
import { PresentationConsentPanel, readInitialSelectedClaimKeys, readSelectedDisclosureLabels } from './PresentationConsentPanel'
import { PresentationInfoPanel } from './PresentationInfoPanel'
import { PresentationResultPanel } from './PresentationResultPanel'
import { PresentationStepScaffold } from './PresentationStepScaffold'
import { TRUSTED_VERIFIERS } from '../config/trustedVerifiers'
import { getCardSchema } from '../config/cardSchemas'
import { filterPresentableCredentials } from '../services/credentials/credentialLifecycle'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import { appendWalletHistoryEvent } from '../services/history/walletEventLog'
import { recordWalletPresentationSuccess } from '../services/history/recordWalletPresentationSuccess'
import { recordWalletInitiatedPresentationFailure } from '../services/history/walletHistoryRecording'
import { maybeConsumeSingleUseCredential } from '../services/credentials/singleUseCredentialConsumption'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { toFriendlyError } from '../services/scan/scanFriendlyErrors'
import { describePresentationForLog } from '../services/scan/scanLogDescriptors'
import { confirmPresentationBiometric, createApprovedPresentationResponse } from '../services/vp/presentationApproval'
import {
  readPresentationTokenMode,
  resolvePresentationRequest,
  submitPresentationResponse,
  type ResolvedPresentationRequest,
} from '../services/vp/presentationService'

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
  | { tag: 'facePrepare'; request: ResolvedPresentationRequest }
  | { tag: 'consent'; request: ResolvedPresentationRequest }
  | { tag: 'info'; request: ResolvedPresentationRequest }
  | { tag: 'success'; verifierName: string }
  | { tag: 'error'; message: string }

type Props = {
  authorizationRequestUri: string
  credentials: VerifiableCredentialRecord[]
  onDone: () => void
  onCancel: () => void
}

/**
 * Shared OID4VP disclosure UX. Reuses the same consent/face/info/result panels as the
 * Scan flow, but is driven by an already-resolved authorization request URI (e.g. the
 * one the Wallet Broker deposits for a My QR engagement) and records history on the
 * wallet-initiated channel.
 */
export function Oid4VpDisclosureFlow({ authorizationRequestUri, credentials, onDone, onCancel }: Props) {
  const [phase, setPhase] = useState<FlowPhase>({ tag: 'resolving' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedClaimKeys, setSelectedClaimKeys] = useState<Set<string>>(() => new Set())
  const generationRef = useRef(0)

  useEffect(() => {
    const gen = ++generationRef.current
    setPhase({ tag: 'resolving' })

    void (async () => {
      try {
        const presentableCredentials = filterPresentableCredentials(credentials)
        logWalletStep('my-qr', 'presentation-credentials-loaded', {
          presentableCount: presentableCredentials.length,
        })
        const request = await withTimeout(
          resolvePresentationRequest(authorizationRequestUri, presentableCredentials, {
            trustedVerifiers: TRUSTED_VERIFIERS,
          }),
          RESOLVE_TIMEOUT_MS,
          'MyQrTimeout: resolving presentation request timed out',
        )
        logWalletStep('my-qr', 'presentation-resolved', describePresentationForLog(request))
        if (generationRef.current === gen) setPhase({ tag: 'facePrepare', request })
      } catch (err) {
        logWalletError('my-qr', 'presentation-resolve-failed', err)
        const raw = err instanceof Error ? err.message : String(err)
        if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
      }
    })()

    return () => {
      generationRef.current++
    }
  }, [authorizationRequestUri, credentials])

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
    const disclosedLabels = readSelectedDisclosureLabels(request.disclosures, holderSelectedClaimKeys)
    try {
      logWalletStep('my-qr', 'presentation-approve-start', describePresentationForLog(request))
      if (readPresentationTokenMode(request) === 'raw-credential') {
        logWalletStep('my-qr', 'presentation-biometric-start', describePresentationForLog(request))
        await confirmPresentationBiometric()
        logWalletStep('my-qr', 'presentation-biometric-complete', describePresentationForLog(request))
      }
      const { vpToken, presentationSubmission } = await createApprovedPresentationResponse(request, {
        selectedClaimKeys: [...holderSelectedClaimKeys],
      })
      const response = await withTimeout(
        submitPresentationResponse(request, { vpToken, presentationSubmission }),
        PRESENT_TIMEOUT_MS,
        'MyQrTimeout: presenting credential timed out',
      )
      logWalletStep('my-qr', 'presentation-submit-complete', {
        ...describePresentationForLog(request),
        responseStatus: response.status,
      })

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
      logWalletStep('my-qr', 'presentation-history-recorded', describePresentationForLog(request))

      if (generationRef.current === gen) {
        setPhase({ tag: 'success', verifierName: request.verifier.name })
      }
    } catch (err) {
      logWalletError('my-qr', 'presentation-approve-failed', err)
      recordWalletInitiatedPresentationFailure({
        record: request.matchedCredential,
        disclosedClaims: request.disclosures.map((disclosure) => disclosure.label),
      })
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    } finally {
      setIsSubmitting(false)
    }
  }, [isSubmitting])

  const declinePresentation = useCallback((request: ResolvedPresentationRequest) => {
    logWalletStep('my-qr', 'presentation-user-declined', describePresentationForLog(request))
    appendWalletHistoryEvent({
      kind: 'presentation-declined',
      credentialId: request.matchedCredential.id,
      documentType: getCardSchema(request.matchedCredential.type).title,
      partyName: request.verifier.name,
      disclosedClaims: readSelectedDisclosureLabels(
        request.disclosures,
        readInitialSelectedClaimKeys(request.disclosures),
      ),
      channel: 'wallet',
    })
    onCancel()
  }, [onCancel])

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
            logWalletStep('my-qr', 'presentation-consent-acknowledged', describePresentationForLog(phase.request))
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
      <PresentationStepScaffold title="Wallet" onBack={() => declinePresentation(phase.request)}>
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
            logWalletStep('my-qr', 'presentation-user-accepted', describePresentationForLog(phase.request))
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
