/**
 * DC API presentation orchestrator — consent, native DeviceResponse sign, platform response.
 * Journey: Chrome / digital-credentials.dev Digital Credentials API.
 * Layout: PresentationConsentPanel, PresentationInfoPanel, PresentationResultPanel.
 * Next: completeDcApiSession back to Android Credential Manager.
 * Map: docs/CODEMAPS/frontend.md#dc-api-presentation
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PresentationFailurePanel } from './PresentationFailurePanel'
import {
  PresentationConsentPanel,
  readInitialSelectedClaimKeys,
  readSelectedDisclosureLabels,
} from './PresentationConsentPanel'
import { PresentationInfoPanel } from './PresentationInfoPanel'
import { PresentationResultPanel } from './PresentationResultPanel'
import { PresentationStepScaffold } from './PresentationStepScaffold'
import { readHistoryDocumentLabel } from '../config/historyDisplayNames'
import { readPresentationVerifierDisplayName } from '../config/presentationVerifierMocks'
import { useStoredCredentials } from '../hooks/useStoredCredentials'
import { subscribeCredentialsChange } from '../services/credentials/storedCredentials'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import { recordSuccessfulPresentation } from '../services/history/presentationHistory'
import { resolvePresentationFailureUi, type PresentationFailureUi } from '../services/vp/presentationFailureUi'
import { isPresentationCredentialMissingError } from '../services/vp/presentationUnavailable'
import {
  buildDcApiConsentRequest,
  readApprovedDcApiNamespaceKeys,
} from '../services/vp/dcApi/dcApiConsentModel'
import {
  resolveQueuedDcApiPresentation,
} from '../services/vp/dcApi/dcApiConsentBridge'
import { runDcApiRegistrySync } from '../hooks/useDcApiProviderStartup'
import {
  completeDcApiPresentation,
  type DcApiResolvedPresentation,
} from '../services/vp/dcApi/dcApiPresentationService'
import {
  cancelDcApiSession,
  completeDcApiSession,
} from '../services/vp/dcApi/nativeDcApiProviderModule'
import { formatDcApiDigitalCredentialResponse } from '../services/vp/dcApi/dcApiResponseBuilder'
import { useDcApiPresentationStore } from '../store/dcApiPresentationStore'

type FlowPhase =
  | { tag: 'loading' }
  | { tag: 'failure'; details: PresentationFailureUi }
  | { tag: 'consent'; resolved: DcApiResolvedPresentation }
  | { tag: 'info'; resolved: DcApiResolvedPresentation }
  | { tag: 'success'; verifierName: string }

type Props = {
  onDone: () => void
  onCancel: () => void
}

export function DcApiPresentationFlow({ onDone, onCancel }: Props) {
  const { credentials, status: credentialsStatus } = useStoredCredentials()
  const phase = useDcApiPresentationStore((state) => state.phase)
  const consentAcceptedSessionId = useDcApiPresentationStore((state) => state.consentAcceptedSessionId)
  const storedSelectedClaimKeys = useDcApiPresentationStore((state) => state.selectedClaimKeys)
  const clearPresentation = useDcApiPresentationStore((state) => state.clearPresentation)
  const markConsentAccepted = useDcApiPresentationStore((state) => state.markConsentAccepted)
  const markCompleting = useDcApiPresentationStore((state) => state.markCompleting)
  const markFinished = useDcApiPresentationStore((state) => state.markFinished)
  const restoreReadyPresentation = useDcApiPresentationStore((state) => state.restoreReadyPresentation)
  const [uiPhase, setUiPhase] = useState<FlowPhase>({ tag: 'loading' })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedClaimKeys, setSelectedClaimKeys] = useState<Set<string>>(
    () => new Set(storedSelectedClaimKeys),
  )
  const [resolveRetryNonce, setResolveRetryNonce] = useState(0)
  const resolvedRef = useRef<DcApiResolvedPresentation | null>(null)
  const resolveAttemptRef = useRef<string | null>(null)
  const waitingForMdocRef = useRef(false)
  const uiSessionRef = useRef<string | null>(null)
  const credentialsRef = useRef(credentials)
  credentialsRef.current = credentials
  const mdlCredentialKey = JSON.stringify(credentials.map((record) => record.id))

  const pendingSessionId = phase.tag === 'pending' ? phase.sessionId : null

  useEffect(() => {
    if (phase.tag !== 'pending') return undefined
    if (uiPhase.tag === 'failure') return undefined

    const retryResolve = () => {
      if (!waitingForMdocRef.current) return
      resolveAttemptRef.current = null
      setResolveRetryNonce((value) => value + 1)
    }

    return subscribeCredentialsChange(retryResolve)
  }, [pendingSessionId, phase.tag, uiPhase.tag])

  useEffect(() => {
    if (phase.tag === 'idle') {
      uiSessionRef.current = null
      resolveAttemptRef.current = null
      return
    }

    if (phase.tag !== 'pending' && phase.tag !== 'ready') return

    if (phase.tag === 'pending' && credentialsStatus !== 'ready') return
    if (phase.tag === 'pending' && credentials.length === 0) return

    if (phase.tag === 'pending' && uiPhase.tag === 'failure' && uiSessionRef.current === phase.sessionId) {
      return
    }

    if (phase.tag === 'pending') {
      if (uiSessionRef.current !== phase.sessionId) {
        setUiPhase({ tag: 'loading' })
        resolvedRef.current = null
        uiSessionRef.current = null
        resolveAttemptRef.current = null
      } else if (uiPhase.tag === 'success') {
        setUiPhase({ tag: 'loading' })
        resolvedRef.current = null
        uiSessionRef.current = null
        resolveAttemptRef.current = null
      }
    }

    if (phase.tag === 'ready') {
      resolvedRef.current = phase.resolved
      if (
        uiSessionRef.current === phase.sessionId
        && (uiPhase.tag === 'consent' || uiPhase.tag === 'info')
      ) {
        return
      }
      uiSessionRef.current = phase.sessionId
      if (consentAcceptedSessionId === phase.sessionId) {
        setSelectedClaimKeys(new Set(storedSelectedClaimKeys))
        setUiPhase({ tag: 'info', resolved: phase.resolved })
        return
      }
      setUiPhase({ tag: 'consent', resolved: phase.resolved })
      return
    }

    if (uiSessionRef.current !== phase.sessionId) {
      uiSessionRef.current = null
      resolveAttemptRef.current = null
    }

    const resolveKey = `${phase.sessionId}:${mdlCredentialKey}:${resolveRetryNonce}`
    if (resolveAttemptRef.current === resolveKey) return
    resolveAttemptRef.current = resolveKey
    uiSessionRef.current = phase.sessionId
    waitingForMdocRef.current = false

    void resolveQueuedDcApiPresentation()
      .then(() => {
        resolveAttemptRef.current = null
        waitingForMdocRef.current = false
      })
      .catch((error) => {
        if (isPresentationCredentialMissingError(error)) {
          resolveAttemptRef.current = null
          waitingForMdocRef.current = true
          logWalletStep('dc-api-provider', 'resolve-waiting-for-mdoc-credentials', {
            credentialCount: credentialsRef.current.length,
          })
          setUiPhase({ tag: 'loading' })
          void runDcApiRegistrySync('dc-api-presentation-retry').then(() => {
            setResolveRetryNonce((value) => value + 1)
          })
          return
        }
        waitingForMdocRef.current = false
        uiSessionRef.current = phase.sessionId
        setUiPhase({ tag: 'failure', details: resolvePresentationFailureUi(error) })
      })
  }, [consentAcceptedSessionId, credentials.length, credentialsStatus, mdlCredentialKey, phase, resolveRetryNonce, storedSelectedClaimKeys, uiPhase.tag])

  const finishWithCancel = useCallback(async (reason: string) => {
    const sessionId = phase.tag === 'idle' ? null : phase.sessionId
    if (sessionId) {
      try {
        await cancelDcApiSession(sessionId, reason)
      } catch (error) {
        logWalletError('dc-api-provider', 'cancel-session-failed', error)
      }
    }
    clearPresentation()
    onCancel()
  }, [clearPresentation, onCancel, phase])

  const approvePresentation = useCallback(async (
    resolved: DcApiResolvedPresentation,
    selectedKeys: ReadonlySet<string>,
  ) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    const transport = phase.tag === 'ready' ? phase.transport : 'same_device'
    markCompleting(resolved.sessionId)

    try {
      const approvedNamespaceKeys = readApprovedDcApiNamespaceKeys(resolved, selectedKeys)
      const payload = await completeDcApiPresentation({
        presentation: resolved,
        approvedNamespaceKeys,
      })
      const responseJson = formatDcApiDigitalCredentialResponse(payload, resolved.protocol)
      logWalletStep('dc-api-provider', 'submitting-credential-response', {
        transport,
        responseMode: payload.responseMode,
        selectedDcqlQueryId: resolved.selectedDcqlQueryId,
        vpTokenQueryIds:
          payload.responseMode === 'dc_api'
            ? Object.keys(payload.data.vp_token)
            : ['dc_api.jwt'],
      })
      await completeDcApiSession(resolved.sessionId, responseJson)
      markFinished(resolved.sessionId)

      const consentRequest = buildDcApiConsentRequest(resolved)
      const disclosedLabels = readSelectedDisclosureLabels(consentRequest.disclosures, selectedKeys)
      recordSuccessfulPresentation({
        credentialId: consentRequest.matchedCredential.id,
        credentialType: consentRequest.matchedCredential.type,
        verifierName: readPresentationVerifierDisplayName(
          consentRequest.matchedCredential.type,
          consentRequest.verifier.name,
        ),
        documentType: readHistoryDocumentLabel({
          credentialType: consentRequest.matchedCredential.type,
        }),
        disclosedClaims: disclosedLabels,
        deliveryPath: 'deep-link',
      })
      logWalletStep('dc-api-provider', 'presentation-completed', {
        responseMode: payload.responseMode,
        protocol: resolved.protocol,
        selectedDcqlQueryId: resolved.selectedDcqlQueryId,
        transport,
      })
      setUiPhase({ tag: 'success', verifierName: consentRequest.verifier.name })
    } catch (error) {
      logWalletError('dc-api-provider', 'presentation-submit-failed', error)
      restoreReadyPresentation(resolved, transport)
      setUiPhase({ tag: 'failure', details: resolvePresentationFailureUi(error) })
    } finally {
      setIsSubmitting(false)
    }
  }, [clearPresentation, isSubmitting, markCompleting, markFinished, onDone, phase, restoreReadyPresentation])

  if (uiPhase.tag === 'failure') {
    return (
      <PresentationStepScaffold onBack={() => void finishWithCancel('user-dismissed-failure')}>
        <PresentationFailurePanel
          {...uiPhase.details}
          presentationOrigin="scanned-verifier-qr"
          onBack={() => void finishWithCancel('user-dismissed-failure')}
        />
      </PresentationStepScaffold>
    )
  }

  if (phase.tag === 'pending') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <ActivityIndicator size="large" color="#1B2559" />
        <Text className="mt-4 text-center text-base text-slate-600">กำลังตรวจสอบคำขอจากผู้ตรวจสอบ...</Text>
      </SafeAreaView>
    )
  }

  if (uiPhase.tag === 'loading') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
        <ActivityIndicator size="large" color="#1B2559" />
        <Text className="mt-4 text-center text-base text-slate-600">กำลังตรวจสอบคำขอจากผู้ตรวจสอบ...</Text>
      </SafeAreaView>
    )
  }

  if (uiPhase.tag === 'consent' && phase.tag === 'ready') {
    const consentRequest = buildDcApiConsentRequest(uiPhase.resolved)
    return (
      <PresentationStepScaffold onBack={() => void finishWithCancel('user-rejected-consent')}>
        <PresentationConsentPanel
          request={consentRequest}
          onAccept={() => {
            const initialKeys = readInitialSelectedClaimKeys(consentRequest.disclosures)
            markConsentAccepted(uiPhase.resolved.sessionId, [...initialKeys])
            setSelectedClaimKeys(new Set(initialKeys))
            setUiPhase({ tag: 'info', resolved: uiPhase.resolved })
          }}
          onReject={() => void finishWithCancel('user-rejected-consent')}
        />
      </PresentationStepScaffold>
    )
  }

  if (uiPhase.tag === 'info' && phase.tag === 'ready') {
    const consentRequest = buildDcApiConsentRequest(uiPhase.resolved)
    return (
      <PresentationStepScaffold title="Wallet" onBack={() => void finishWithCancel('user-rejected-info')}>
        <PresentationInfoPanel
          request={consentRequest}
          selectedClaimKeys={selectedClaimKeys}
          onToggleClaim={(claimKey) => {
            setSelectedClaimKeys((previous) => {
              const next = new Set(previous)
              if (next.has(claimKey)) next.delete(claimKey)
              else next.add(claimKey)
              return next
            })
          }}
          onConfirm={() => void approvePresentation(uiPhase.resolved, selectedClaimKeys)}
          submitting={isSubmitting}
        />
      </PresentationStepScaffold>
    )
  }

  if (uiPhase.tag === 'success') {
    return (
      <PresentationStepScaffold title="Verifier" onBack={onDone}>
        <PresentationResultPanel
          verifierName={uiPhase.verifierName}
          onDone={() => {
            clearPresentation()
            onDone()
          }}
        />
      </PresentationStepScaffold>
    )
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
      <ActivityIndicator size="large" color="#1B2559" />
      <Text className="mt-4 text-center text-base text-slate-600">กำลังตรวจสอบคำขอจากผู้ตรวจสอบ...</Text>
    </SafeAreaView>
  )
}
