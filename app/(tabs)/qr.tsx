import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppButton } from '../../src/components/AppButton'
import { WalletHeader } from '../../src/components/WalletHeader'
import { WalletInitiatedVpQrPanel } from '../../src/components/WalletInitiatedVpQrPanel'
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials'
import { useWalletInitiatedVpQrSession } from '../../src/hooks/useWalletInitiatedVpQrSession'
import { readPidGateStatus } from '../../src/services/credentials/credentialGuard'
import { openCredentialRequestPortal } from '../../src/services/credentials/openCredentialRequestPortal'
import { resolvePidVpQrCredential } from '../../src/services/credentials/resolvePidVpQrCredential'
import { WALLET_HOME_COPY } from '../../src/services/credentials/walletHomeCopy'

export default function MyQrScreen() {
  const router = useRouter()
  const { status, credentials } = useStoredCredentials()
  const [isFocused, setIsFocused] = useState(false)

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true)
      return () => setIsFocused(false)
    }, []),
  )

  const pidCredential = useMemo(() => resolvePidVpQrCredential(credentials), [credentials])
  const pidGateStatus = useMemo(() => readPidGateStatus(credentials), [credentials])

  const { phase, qrUrl, devEnvLine, minutes, seconds, startSession } = useWalletInitiatedVpQrSession({
    credential: pidCredential,
    active: isFocused && pidCredential !== undefined,
  })

  const handleRetry = useCallback(() => {
    void startSession()
  }, [startSession])

  const handleRequestThaId = useCallback(() => {
    void openCredentialRequestPortal('ThaiNationalID')
  }, [])

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader />

      <View className="flex-1 items-center bg-wallet-bg px-6 pt-12">
        <Text className="text-center text-[26px] font-bold leading-9 text-ink">
          My ID Card{'\n'}QR Code
        </Text>

        {status === 'storage-not-ready' || status === 'error' ? (
          <View className="mt-12 items-center gap-3 px-4">
            <Text className="text-center text-base font-semibold text-navy">ไม่สามารถโหลดเอกสารได้</Text>
            <Text className="text-center text-sm text-gray600">กรุณาลองใหม่อีกครั้ง</Text>
          </View>
        ) : null}

        {status === 'ready' && !pidCredential && pidGateStatus === 'missing' ? (
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

        {status === 'ready' && !pidCredential && pidGateStatus === 'renewal-required' ? (
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

        {status === 'ready' && !pidCredential && pidGateStatus === 'ready' ? (
          <View className="mt-12 items-center gap-4 px-4">
            <Text className="text-center text-base font-semibold text-navy">ไม่สามารถแสดง QR ได้</Text>
            <Text className="text-center text-sm leading-6 text-gray600">
              เอกสาร ThaID ยังไม่พร้อมสำหรับการนำเสนอ
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

        {status === 'ready' && pidCredential ? (
          <View className="mt-8 w-full items-center">
            <WalletInitiatedVpQrPanel
              phase={phase === 'idle' ? 'loading' : phase}
              qrUrl={qrUrl}
              minutes={minutes}
              seconds={seconds}
              devEnvLine={devEnvLine}
              onRetry={handleRetry}
              qrSize={210}
              showVerifiedRetry
            />
            {phase === 'ready' ? (
              <Text className="mt-7 text-center text-[15px] font-semibold leading-7 text-wallet-navy">
                สแกน QR Code ของฉัน{'\n'}เพื่อตรวจดูเอกสาร
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
