import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../../src/components/AppButton'
import { Oid4VpDisclosureFlow } from '../../src/components/Oid4VpDisclosureFlow'
import { WalletHeader } from '../../src/components/WalletHeader'
import { WalletInitiatedVpQrPanel } from '../../src/components/WalletInitiatedVpQrPanel'
import { useAndroidBackNavigation } from '../../src/hooks/useAndroidBackNavigation'
import { useReturnToWallet } from '../../src/hooks/useReturnToWallet'
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials'
import { useWalletInitiatedVpQrSession } from '../../src/hooks/useWalletInitiatedVpQrSession'
import { readPidGateStatus } from '../../src/services/credentials/credentialGuard'
import { isCredentialPresentable } from '../../src/services/credentials/credentialLifecycle'
import { openCredentialRequestPortal } from '../../src/services/credentials/openCredentialRequestPortal'
import type { IssuerPortalCredentialType } from '../../src/config/issuerPortalUrls'
import { resolveMyQrPresentationCredential } from '../../src/services/credentials/resolveMyQrPresentationCredential'
import { WALLET_HOME_COPY } from '../../src/services/credentials/walletHomeCopy'
import { isSdJwtCredential } from '../../src/services/vp/sdJwtCredential'
import type { VerifiableCredentialRecord } from '../../src/services/vci/exchangeService'

type ResolverStatus = 'loading' | 'ready' | 'missing'

export default function MyQrScreen() {
  const router = useRouter()
  const returnToWallet = useReturnToWallet(router)
  const { brokerSessionId, credentialId } = useLocalSearchParams<{
    brokerSessionId?: string
    credentialId?: string
  }>()
  const { status, credentials } = useStoredCredentials()
  const handleAndroidBack = useCallback(() => {
    returnToWallet()
  }, [returnToWallet])
  const [isFocused, setIsFocused] = useState(false)
  const [presentationCredential, setPresentationCredential] = useState<VerifiableCredentialRecord | undefined>()
  const [resolverStatus, setResolverStatus] = useState<ResolverStatus>('loading')

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true)
      return () => setIsFocused(false)
    }, []),
  )

  useAndroidBackNavigation(handleAndroidBack)

  useEffect(() => {
    if (status !== 'ready') {
      setPresentationCredential(undefined)
      setResolverStatus('loading')
      return
    }

    let cancelled = false
    void (async () => {
      setResolverStatus('loading')
      const selectedCredentialId = typeof credentialId === 'string' ? credentialId.trim() : ''
      const selectedCredential = selectedCredentialId
        ? credentials.find((record) => record.id === selectedCredentialId)
        : undefined
      const resolved =
        selectedCredential
        && isSdJwtCredential(selectedCredential)
        && isCredentialPresentable(selectedCredential)
          ? selectedCredential
          : await resolveMyQrPresentationCredential(credentials)
      if (cancelled) return
      setPresentationCredential(resolved)
      setResolverStatus(resolved ? 'ready' : 'missing')
    })()

    return () => {
      cancelled = true
    }
  }, [credentialId, credentials, status])

  const pidGateStatus = useMemo(() => readPidGateStatus(credentials), [credentials])
  const usesDrivingLicenceMyQr = presentationCredential?.type === 'DLTDrivingLicence'
  const resumeSessionId = typeof brokerSessionId === 'string' ? brokerSessionId.trim() : ''

  const { phase, qrUrl, minutes, seconds, authorizationRequestUri, startSession } =
    useWalletInitiatedVpQrSession({
      credential: presentationCredential,
      active: isFocused && resolverStatus === 'ready' && presentationCredential !== undefined,
      resumeSessionId: resumeSessionId || undefined,
    })

  const handleRetry = useCallback(() => {
    void startSession()
  }, [startSession])

  const handleDisclosureDone = useCallback(() => {
    void startSession()
  }, [startSession])

  const handleRequestThaId = useCallback(() => {
    void openCredentialRequestPortal('ThaiNationalID')
  }, [])

  const handleRequestPresentationCredential = useCallback(
    (credentialType: IssuerPortalCredentialType) => {
      void openCredentialRequestPortal(credentialType)
    },
    [],
  )

  const scanHint = usesDrivingLicenceMyQr
    ? WALLET_HOME_COPY.myQrScanHintDrivingLicence
    : WALLET_HOME_COPY.myQrScanHintDefault

  if (phase === 'request_ready' && authorizationRequestUri) {
    return (
      <Oid4VpDisclosureFlow
        authorizationRequestUri={authorizationRequestUri}
        credentials={credentials}
        presentationOrigin="wallet-generated-qr"
        onRequestCredential={handleRequestPresentationCredential}
        onDone={handleDisclosureDone}
        onCancel={handleDisclosureDone}
      />
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader />

      <View className="flex-1 items-center bg-wallet-bg px-6 pt-12">
        <Text className="text-center text-[26px] font-bold leading-9 text-ink">
          My QR
        </Text>

        {status === 'storage-not-ready' || status === 'error' ? (
          <View className="mt-12 items-center gap-3 px-4">
            <Text className="text-center text-base font-semibold text-navy">ไม่สามารถโหลดเอกสารได้</Text>
            <Text className="text-center text-sm text-gray600">กรุณาลองใหม่อีกครั้ง</Text>
          </View>
        ) : null}

        {status === 'ready' && resolverStatus === 'loading' ? (
          <View className="mt-12 items-center gap-3 px-4">
            <Text className="text-center text-sm text-gray600">กำลังเตรียม QR…</Text>
          </View>
        ) : null}

        {status === 'ready' && resolverStatus === 'missing' && !usesDrivingLicenceMyQr && pidGateStatus === 'missing' ? (
          <View className="mt-12 items-center gap-4 px-4">
            <Text className="text-center text-base font-semibold text-navy">{WALLET_HOME_COPY.pidRequiredTitle}</Text>
            <Text className="text-center text-sm leading-6 text-gray600">{WALLET_HOME_COPY.pidRequiredMessage}</Text>
            <AppButton
              variant="solid-block"
              label={WALLET_HOME_COPY.requestThaId}
              onPress={handleRequestThaId}
              className="mt-2 rounded-xl px-6 py-3"
              textClassName="text-center text-sm font-bold"
            />
          </View>
        ) : null}

        {status === 'ready' && resolverStatus === 'missing' && !usesDrivingLicenceMyQr && pidGateStatus === 'renewal-required' ? (
          <View className="mt-12 items-center gap-4 px-4">
            <Text className="text-center text-base font-semibold text-navy">
              {WALLET_HOME_COPY.renewThaIdRequiredTitle}
            </Text>
            <Text className="text-center text-sm leading-6 text-gray600">
              {WALLET_HOME_COPY.renewThaIdRequiredMessage}
            </Text>
            <AppButton
              variant="outline-block"
              label="ไปที่เอกสาร ThaID"
              onPress={() => {
                const thaiId = credentials.find((record) => record.type === 'ThaiNationalID')
                if (thaiId) {
                  router.push(`/(tabs)/credential/${thaiId.id}`)
                }
              }}
              className="mt-2 rounded-xl px-6 py-3"
              textClassName="text-center text-sm font-bold"
            />
          </View>
        ) : null}

        {status === 'ready' && resolverStatus === 'missing' && pidGateStatus === 'ready' ? (
          <View className="mt-12 items-center gap-4 px-4">
            <Text className="text-center text-base font-semibold text-navy">
              {WALLET_HOME_COPY.myQrNoEligibleDocumentTitle}
            </Text>
            <Text className="text-center text-sm leading-6 text-gray600">
              {WALLET_HOME_COPY.myQrNoEligibleDocumentMessage}
            </Text>
          </View>
        ) : null}

        {status === 'ready' && resolverStatus === 'ready' && presentationCredential ? (
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
                {scanHint}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
