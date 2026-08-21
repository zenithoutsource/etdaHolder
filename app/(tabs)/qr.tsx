/**
 * My QR tab — wallet-initiated VP QR, then OID4VP disclosure when the Verifier posts a request.
 * Journey: P4 wallet-initiated presentation.
 * Copy: src/services/credentials/walletHomeCopy.ts (myQr*); PID-gate copy.
 * Layout: MyQrPidGatePanel, WalletInitiatedVpQrPanel, or Oid4VpDisclosureFlow.
 * Next: disclosure flow on the same route.
 * Map: docs/CODEMAPS/frontend.md#my-qr
 */

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Oid4VpDisclosureFlow } from '../../src/components/Oid4VpDisclosureFlow'
import { MyQrPidGatePanel } from '../../src/components/MyQrPidGatePanel'
import { WalletHeader } from '../../src/components/WalletHeader'
import { WalletInitiatedVpQrPanel } from '../../src/components/WalletInitiatedVpQrPanel'
import { useAndroidBackNavigation } from '../../src/hooks/useAndroidBackNavigation'
import { useReturnToWallet } from '../../src/hooks/useReturnToWallet'
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials'
import { useWalletInitiatedVpQrSession } from '../../src/hooks/useWalletInitiatedVpQrSession'
import { openCredentialRequestPortal } from '../../src/services/credentials/openCredentialRequestPortal'
import { readPidGateStatus } from '../../src/services/credentials/credentialGuard'
import type { IssuerPortalCredentialType } from '../../src/config/issuerPortalUrls'
import { WALLET_HOME_COPY } from '../../src/services/credentials/walletHomeCopy'

export default function MyQrScreen() {
  const router = useRouter()
  const returnToWallet = useReturnToWallet(router)
  const { brokerSessionId } = useLocalSearchParams<{
    brokerSessionId?: string
  }>()
  const { status, credentials } = useStoredCredentials()
  const handleAndroidBack = useCallback(() => {
    returnToWallet()
  }, [returnToWallet])
  const [isFocused, setIsFocused] = useState(false)

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true)
      return () => setIsFocused(false)
    }, []),
  )

  useAndroidBackNavigation(handleAndroidBack)

  const resumeSessionId = typeof brokerSessionId === 'string' ? brokerSessionId.trim() : ''
  const storageReady = status === 'ready'
  const pidGateStatus = readPidGateStatus(credentials)
  const pidReady = pidGateStatus === 'ready'
  const showPidGate = storageReady && pidGateStatus !== 'ready' && !resumeSessionId
  const { phase, qrUrl, minutes, seconds, authorizationRequestUri, startSession } =
    useWalletInitiatedVpQrSession({
      active: isFocused && storageReady && (pidReady || Boolean(resumeSessionId)),
      resumeSessionId: resumeSessionId || undefined,
    })

  const handleRetry = useCallback(() => {
    void startSession()
  }, [startSession])

  const handleDisclosureDone = useCallback(() => {
    void startSession()
  }, [startSession])

  const handleRequestPresentationCredential = useCallback(
    (credentialType: IssuerPortalCredentialType) => {
      void openCredentialRequestPortal(credentialType)
    },
    [],
  )

  if (phase === 'request_ready' && authorizationRequestUri) {
    return (
      <Oid4VpDisclosureFlow
        authorizationRequestUri={authorizationRequestUri}
        credentials={credentials}
        presentationOrigin="wallet-generated-qr"
        presentationFlowOrigin="my-qr"
        onRequestCredential={handleRequestPresentationCredential}
        onDone={handleDisclosureDone}
        onCancel={handleDisclosureDone}
      />
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader />

      <View className={`flex-1 items-center bg-wallet-bg px-6 ${showPidGate ? 'pt-6' : 'pt-12'}`}>
        {showPidGate ? null : (
          <Text className="text-center text-[26px] font-bold leading-9 text-ink">
            My QR
          </Text>
        )}

        {status === 'storage-not-ready' || status === 'error' ? (
          <View className="mt-12 items-center gap-3 px-4">
            <Text className="text-center text-base font-semibold text-navy">ไม่สามารถโหลดเอกสารได้</Text>
            <Text className="text-center text-sm text-gray600">กรุณาลองใหม่อีกครั้ง</Text>
          </View>
        ) : null}

        {showPidGate ? (
          <MyQrPidGatePanel
            gateStatus={pidGateStatus}
            onRequestPid={() => handleRequestPresentationCredential('ThaiNationalID')}
          />
        ) : null}

        {storageReady && (pidReady || Boolean(resumeSessionId)) ? (
          <View className="mt-8 w-full items-center">
            <WalletInitiatedVpQrPanel
              phase={phase === 'idle' ? 'loading' : phase}
              qrUrl={qrUrl}
              minutes={minutes}
              seconds={seconds}
              onRetry={handleRetry}
              qrSize={210}
            />
            {phase === 'waiting_scan' ? (
              <Text className="mt-7 text-center text-[15px] font-semibold leading-7 text-wallet-navy">
                {WALLET_HOME_COPY.myQrScanHint}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
