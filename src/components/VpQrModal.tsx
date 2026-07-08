import QRCode from 'react-native-qrcode-svg'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { logWalletError } from '../services/debug/walletLogger'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'
import {
  buildQrUrl,
  buildWalletInitiatedVpToken,
  createVpSession,
  recordWalletInitiatedPresentationHistory,
  submitVpToSession,
} from '../services/vp/walletInitiatedPresentation'
import {
  formatVpIssuerPublicKeyEnvLine,
  resolveIssuerPublicJwkFromRawVc,
} from '../services/vp/resolveIssuerPublicJwkFromRawVc'

type Props = {
  visible: boolean
  credential: VerifiableCredentialRecord
  onClose: () => void
}

type ModalPhase = 'loading' | 'ready' | 'expired' | 'error'

export function VpQrModal({ visible, credential, onClose }: Props) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [phase, setPhase] = useState<ModalPhase>('loading')

  const startSession = useCallback(async () => {
    setPhase('loading')
    setQrUrl(null)
    if (__DEV__) {
      try {
        const jwk = resolveIssuerPublicJwkFromRawVc(credential.rawVc)
        console.info('[vp-relay-setup] Paste into server/.env:')
        console.info(formatVpIssuerPublicKeyEnvLine(jwk))
      } catch (error) {
        console.warn(
          '[vp-relay-setup] Could not derive issuer key from rawVc. Run: cd server && yarn resolve-vp-issuer-key --raw-vc-file rawVc.txt --write-env',
          error instanceof Error ? error.message : String(error),
        )
      }
    }
    try {
      const session = await createVpSession()
      const vpToken = await buildWalletInitiatedVpToken(credential, session)
      await submitVpToSession(session.sessionId, vpToken, credential.type)
      recordWalletInitiatedPresentationHistory(credential)
      setQrUrl(buildQrUrl(session.sessionId))
      setExpiresAt(session.expiresAt)
      setPhase('ready')
    } catch (error) {
      logWalletError('vp-relay', 'session-start-failed', error)
      setPhase('error')
    }
  }, [credential])

  useEffect(() => {
    if (!visible) return
    void startSession()
  }, [visible, startSession])

  useEffect(() => {
    if (!expiresAt || phase !== 'ready') return undefined

    const tick = () => {
      const ms = Date.parse(expiresAt) - Date.now()
      if (ms <= 0) {
        setRemainingMs(0)
        setPhase('expired')
        return
      }
      setRemainingMs(ms)
    }

    tick()
    const timerId = setInterval(tick, 1000)
    return () => clearInterval(timerId)
  }, [expiresAt, phase])

  const minutes = String(Math.floor(remainingMs / 60_000))
  const seconds = String(Math.floor((remainingMs % 60_000) / 1000)).padStart(2, '0')

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/45 px-6"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close VP QR dialog"
      >
        <Pressable
          className="w-full max-w-[340px] rounded-2xl bg-white px-6 py-7"
          onPress={(event) => event.stopPropagation()}
        >
          {phase === 'loading' ? (
            <View className="items-center gap-4 py-8">
              <ActivityIndicator size="large" />
              <Text className="text-center text-sm text-gray600">กำลังสร้าง QR…</Text>
            </View>
          ) : null}

          {phase === 'ready' && qrUrl ? (
            <View className="items-center gap-4">
              <View className="rounded-xl bg-white p-4">
                <QRCode value={qrUrl} size={220} />
              </View>
              <Text className="text-center text-base font-semibold text-navy">
                หมดอายุใน {minutes}:{seconds}
              </Text>
              <Text className="text-center text-sm text-gray600">ให้ Verifier สแกน QR นี้</Text>
              <Text className="text-center text-sm text-gray600">ใช้ได้ครั้งเดียวเท่านั้น</Text>
            </View>
          ) : null}

          {phase === 'expired' ? (
            <View className="items-center gap-4 py-4">
              <Text className="text-center text-base font-semibold text-danger-dark">QR หมดอายุ</Text>
              <AppButton
                variant="solid-block"
                label="สร้างใหม่"
                onPress={() => {
                  void startSession()
                }}
                className="w-full rounded-xl py-3"
                textClassName="text-center text-sm font-bold"
              />
            </View>
          ) : null}

          {phase === 'error' ? (
            <View className="items-center gap-4 py-4">
              <Text className="text-center text-base font-semibold text-danger-dark">ไม่สามารถสร้าง QR ได้</Text>
              <AppButton
                variant="solid-block"
                label="ลองอีกครั้ง"
                onPress={() => {
                  void startSession()
                }}
                className="w-full rounded-xl py-3"
                textClassName="text-center text-sm font-bold"
              />
            </View>
          ) : null}

          <View className="mt-6">
            <AppButton
              variant="outline-block"
              label="ยกเลิก"
              onPress={onClose}
              className="w-full rounded-xl py-3"
              textClassName="text-center text-sm font-bold"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
