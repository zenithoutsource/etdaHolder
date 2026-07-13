import { useCallback, useEffect, useState } from 'react'

import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import {
  buildQrUrl,
  buildWalletInitiatedVpToken,
  createVpSession,
  fetchVpSessionStatus,
  readWalletInitiatedClaimLabels,
  recordWalletInitiatedPresentationHistory,
  submitVpToSession,
} from '../services/vp/walletInitiatedPresentation'
import { recordWalletInitiatedPresentationFailure } from '../services/history/walletHistoryRecording'
import {
  formatVpIssuerPublicKeyEnvLine,
  resolveIssuerPublicJwkFromRawVc,
} from '../services/vp/resolveIssuerPublicJwkFromRawVc'

export type WalletInitiatedVpQrPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'verified'
  | 'verify_failed'
  | 'expired'
  | 'error'

type Options = {
  credential: VerifiableCredentialRecord | undefined
  active: boolean
}

export function useWalletInitiatedVpQrSession({ credential, active }: Options) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [phase, setPhase] = useState<WalletInitiatedVpQrPhase>('idle')
  const [devEnvLine, setDevEnvLine] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [historyRecorded, setHistoryRecorded] = useState(false)

  const startSession = useCallback(async () => {
    if (!credential) return

    setPhase('loading')
    setQrUrl(null)
    setDevEnvLine(null)
    setSessionId(null)
    setHistoryRecorded(false)
    logWalletStep('vp-relay', 'session-start', { credentialType: credential.type })

    if (__DEV__) {
      try {
        const jwk = resolveIssuerPublicJwkFromRawVc(credential.rawVc)
        const envLine = formatVpIssuerPublicKeyEnvLine(jwk)
        setDevEnvLine(envLine)
        logWalletStep('vp-relay', 'issuer-key-env-line', { envLine })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logWalletStep('vp-relay', 'issuer-key-resolve-failed', { message })
        logWalletError('vp-relay', 'issuer-key-resolve-failed', error)
      }
    }

    try {
      const session = await createVpSession()
      const vpToken = await buildWalletInitiatedVpToken(credential, session)
      await submitVpToSession(session.sessionId, vpToken, credential.type)
      setSessionId(session.sessionId)
      setQrUrl(buildQrUrl(session))
      setExpiresAt(session.expiresAt)
      setPhase('ready')
    } catch (error) {
      logWalletError('vp-relay', 'session-start-failed', error)
      setPhase('error')
    }
  }, [credential])

  useEffect(() => {
    if (!active || !credential) {
      setPhase('idle')
      setQrUrl(null)
      setExpiresAt(null)
      setSessionId(null)
      setHistoryRecorded(false)
      return
    }

    void startSession()
  }, [active, credential, startSession])

  useEffect(() => {
    if (!expiresAt || phase !== 'ready') return undefined

    const tick = () => {
      const ms = Date.parse(expiresAt) - Date.now()
      if (ms <= 0) {
        setRemainingMs(0)
        setQrUrl(null)
        setPhase('expired')
        return
      }
      setRemainingMs(ms)
    }

    tick()
    const timerId = setInterval(tick, 1000)
    return () => clearInterval(timerId)
  }, [expiresAt, phase])

  useEffect(() => {
    if (!active || phase !== 'ready' || !sessionId || !credential || historyRecorded) return undefined

    let cancelled = false

    const pollVerifierStatus = async () => {
      try {
        const outcome = await fetchVpSessionStatus(sessionId)
        if (cancelled) return

        if (outcome.status === 'verified') {
          recordWalletInitiatedPresentationHistory(credential)
          setHistoryRecorded(true)
          setQrUrl(null)
          setPhase('verified')
          logWalletStep('vp-relay', 'verifier-verified', { sessionPrefix: sessionId.slice(0, 8) })
          return
        }

        if (outcome.status === 'verify_failed') {
          recordWalletInitiatedPresentationFailure({
            record: credential,
            verifierReason: outcome.reason,
            disclosedClaims: readWalletInitiatedClaimLabels(credential),
          })
          setHistoryRecorded(true)
          setQrUrl(null)
          setPhase('verify_failed')
          logWalletStep('vp-relay', 'verifier-verify-failed', {
            sessionPrefix: sessionId.slice(0, 8),
            reason: outcome.reason ?? 'unknown',
          })
          return
        }

        if (outcome.status === 'expired') {
          setRemainingMs(0)
          setQrUrl(null)
          setPhase('expired')
        }
      } catch (error) {
        logWalletError('vp-relay', 'status-poll-failed', error)
      }
    }

    void pollVerifierStatus()
    const timerId = setInterval(() => {
      void pollVerifierStatus()
    }, 2000)

    return () => {
      cancelled = true
      clearInterval(timerId)
    }
  }, [active, phase, sessionId, historyRecorded, credential])

  const minutes = String(Math.floor(remainingMs / 60_000))
  const seconds = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0')

  return {
    phase,
    qrUrl,
    devEnvLine,
    minutes,
    seconds,
    startSession,
  }
}
