import { useCallback, useEffect, useMemo, useState } from 'react'
import { Platform } from 'react-native'

import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import { useAuthStore } from '../store/authStore'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import { resolveDeviceTokenForBroker } from '../services/notifications/expoPushTokenCache'
import { createBrokerSessionClient, type BrokerSessionClient } from '../services/vp/brokerSessionClient'

const POLL_INTERVAL_MS = 2000

export type WalletInitiatedVpQrPhase =
  | 'idle'
  | 'loading'
  | 'waiting_scan'
  | 'request_ready'
  | 'expired'
  | 'error'

type Options = {
  credential: VerifiableCredentialRecord | undefined
  active: boolean
  client?: BrokerSessionClient
  walletId?: string
  deviceToken?: string
  platform?: 'android' | 'ios'
}

export function useWalletInitiatedVpQrSession({
  credential,
  active,
  client,
  walletId: walletIdOverride,
  deviceToken: deviceTokenOverride,
  platform: platformOverride,
}: Options) {
  const authWalletId = useAuthStore((state) => state.walletId)
  const brokerClient = useMemo(() => client ?? createBrokerSessionClient(), [client])

  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [phase, setPhase] = useState<WalletInitiatedVpQrPhase>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [authorizationRequestUri, setAuthorizationRequestUri] = useState<string | null>(null)

  const startSession = useCallback(async () => {
    if (!credential) return

    setPhase('loading')
    setQrUrl(null)
    setSessionId(null)
    setAuthorizationRequestUri(null)
    logWalletStep('vp-broker', 'session-start', { credentialType: credential.type })

    try {
      const deviceToken = deviceTokenOverride ?? (await resolveDeviceTokenForBroker())
      const platform = platformOverride ?? (Platform.OS === 'ios' ? 'ios' : 'android')
      const walletId = walletIdOverride ?? authWalletId ?? ''

      const session = await brokerClient.createSession({ walletId, deviceToken, platform })
      setSessionId(session.session_id)
      setQrUrl(session.qr_payload)
      setExpiresAt(session.expires_at)
      setPhase('waiting_scan')
    } catch (error) {
      logWalletError('vp-broker', 'session-start-failed', error)
      setPhase('error')
    }
  }, [credential, brokerClient, deviceTokenOverride, platformOverride, walletIdOverride, authWalletId])

  useEffect(() => {
    if (!active || !credential) {
      setPhase('idle')
      setQrUrl(null)
      setExpiresAt(null)
      setSessionId(null)
      setAuthorizationRequestUri(null)
      return
    }

    void startSession()
  }, [active, credential, startSession])

  useEffect(() => {
    if (!expiresAt || (phase !== 'waiting_scan' && phase !== 'request_ready')) return undefined

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
    if (!active || phase !== 'waiting_scan' || !sessionId) return undefined

    let cancelled = false

    const pollPresentationRequest = async () => {
      try {
        const uri = await brokerClient.fetchPresentationRequestUri(sessionId)
        if (cancelled || !uri) return

        setAuthorizationRequestUri(uri)
        setPhase('request_ready')
        logWalletStep('vp-broker', 'presentation-request-ready', { sessionPrefix: sessionId.slice(0, 8) })
      } catch (error) {
        logWalletError('vp-broker', 'presentation-request-poll-failed', error)
      }
    }

    void pollPresentationRequest()
    const timerId = setInterval(() => {
      void pollPresentationRequest()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(timerId)
    }
  }, [active, phase, sessionId, brokerClient])

  const minutes = String(Math.floor(remainingMs / 60_000))
  const seconds = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0')

  return {
    phase,
    qrUrl,
    minutes,
    seconds,
    sessionId,
    authorizationRequestUri,
    startSession,
  }
}
