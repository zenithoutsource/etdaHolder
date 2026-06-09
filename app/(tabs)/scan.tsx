import { CameraView, useCameraPermissions } from 'expo-camera'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, Text, TextInput, View, type ImageSourcePropType } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ScanSuccessPanel } from '../../src/components/ScanSuccessPanel'
import { ThaIdVerificationPanel } from '../../src/components/ThaIdVerificationPanel'
import { ThaiIdSuccessConfirmationPanel } from '../../src/components/ThaiIdSuccessConfirmationPanel'
import { WalletHeader } from '../../src/components/WalletHeader'
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials'
import { markCredentialAsNew } from '../../src/services/credentials/credentialBadges'
import { hasPidCredential, isPidCredentialOffer } from '../../src/services/credentials/credentialGuard'
import {
  acquireCredentialRecord,
  resolveOffer,
  saveCredentialRecord,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from '../../src/services/vci/exchangeService'
import { readCredentialHolderProfile } from '../../src/services/credentials/credentialDisplay'
import { readCredentialPreviewDisplay } from '../../src/services/vci/qrIssuanceFlow'

type ScanPhase =
  | { tag: 'scanning' }
  | { tag: 'resolving' }
  | { tag: 'thaIdVerify'; offer: ResolvedCredentialOffer }
  | { tag: 'txCode'; offer: ResolvedCredentialOffer }
  | { tag: 'acquiring' }
  | { tag: 'preview'; record: VerifiableCredentialRecord }
  | { tag: 'saving' }
  | { tag: 'success'; record: VerifiableCredentialRecord }
  | { tag: 'error'; message: string }

const credentialImages: Record<string, ImageSourcePropType> = {
  profile: require('../../assets/images/profile.png'),
  id: require('../../assets/images/user_profile.png'),
  car: require('../../assets/images/car.png'),
  transcript: require('../../assets/images/user_profile.png'),
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

function toFriendlyError(raw: string): string {
  if (raw.includes('ScanTimeout')) return 'Request timed out. Check your connection and try again.'
  if (raw.includes('IssuerMetadataFetchFailed')) return 'Could not reach the issuer. Check your connection and try again.'
  if (raw.includes('CredentialOfferParseFailed') || raw.includes('CredentialOfferInvalid') || raw.includes('CredentialOfferIssuerMissing')) return 'Invalid credential offer. Try scanning again.'
  if (raw.includes('CredentialTokenExchangeFailed')) return 'Authentication with the issuer failed. The transaction code may be incorrect.'
  if (raw.includes('CredentialResponseUnsupported')) return 'The issuer response did not include a compact credential.'
  if (raw.includes('CredentialRequestFailed')) return raw
  if (raw.includes('CredentialFormatUnsupported')) return 'This credential format is not supported by this wallet.'
  if (raw.includes('CredentialStorageFailed')) return 'Could not save the credential to storage. Please try again.'
  if (raw.includes('IssuerMetadataMismatch') || raw.includes('IssuerMetadataInvalid')) return 'The issuer configuration is invalid. Contact the issuer.'
  return raw
}

const RESOLVE_TIMEOUT_MS = 20_000
const ACQUIRE_TIMEOUT_MS = 30_000

export default function ScanScreen() {
  const { credentials } = useStoredCredentials()
  const [permission, requestPermission] = useCameraPermissions()
  const [phase, setPhase] = useState<ScanPhase>({ tag: 'scanning' })
  const [txCode, setTxCode] = useState('')
  const [viewfinderHeight, setViewfinderHeight] = useState(0)
  const processingRef = useRef(false)
  const generationRef = useRef(0)
  const router = useRouter()
  const scanLineAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 2000, useNativeDriver: false }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 2000, useNativeDriver: false }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [scanLineAnim])

  const resetScanner = useCallback(() => {
    generationRef.current++
    setPhase({ tag: 'scanning' })
    setTxCode('')
    processingRef.current = false
  }, [])

  useFocusEffect(
    useCallback(() => {
      resetScanner()
    }, [resetScanner]),
  )

  async function acquireForPreview(offer: ResolvedCredentialOffer, code?: string) {
    const gen = generationRef.current
    setPhase({ tag: 'acquiring' })
    try {
      const record = await withTimeout(
        acquireCredentialRecord(offer, { tx_code: code }),
        ACQUIRE_TIMEOUT_MS,
        'ScanTimeout: acquiring credential timed out',
      )
      if (generationRef.current === gen) setPhase({ tag: 'preview', record })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    }
  }

  async function handleBarcode(uri: string) {
    if (processingRef.current) return
    processingRef.current = true

    if (!uri.startsWith('openid-credential-offer://')) {
      setPhase({ tag: 'error', message: 'Not a credential offer QR code. Please scan a valid issuance QR code.' })
      return
    }

    const gen = generationRef.current
    setPhase({ tag: 'resolving' })
    try {
      const offer = await withTimeout(resolveOffer(uri), RESOLVE_TIMEOUT_MS, 'ScanTimeout: resolving offer timed out')
      setTxCode('')
      const isPidOffer = isPidCredentialOffer(offer)
      if (!hasPidCredential(credentials) && !isPidOffer) {
        if (generationRef.current === gen) setPhase({ tag: 'error', message: 'กรุณาขอ ThaID ก่อน' })
        return
      }
      if (isPidOffer) {
        if (generationRef.current === gen) setPhase({ tag: 'thaIdVerify', offer })
        return
      }
      if (offer.txCode) {
        if (generationRef.current === gen) setPhase({ tag: 'txCode', offer })
        return
      }
      await acquireForPreview(offer)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      if (generationRef.current === gen) setPhase({ tag: 'error', message: toFriendlyError(raw) })
    }
  }

  function handleTxCodeSubmit(offer: ResolvedCredentialOffer) {
    void acquireForPreview(offer, txCode.trim() || undefined)
  }

  function handleThaIdVerified(offer: ResolvedCredentialOffer) {
    if (offer.txCode) {
      setPhase({ tag: 'txCode', offer })
      return
    }
    void acquireForPreview(offer)
  }

  function handleSave(record: VerifiableCredentialRecord) {
    setPhase({ tag: 'saving' })
    try {
      saveCredentialRecord(record)
      markCredentialAsNew(record.id)
      setPhase({ tag: 'success', record })
    } catch (err) {
      setPhase({ tag: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function goToWalletHome() {
    router.replace('/(tabs)')
  }

  if (!permission) {
    return <View className="flex-1" />
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#f4f6fa] p-6">
        <Text className="mb-5 text-center text-[15px] text-[#374151]">
          Camera access is required to scan QR codes.
        </Text>
        <Pressable className="items-center rounded-xl bg-wallet-navy px-[18px] py-[14px]" onPress={requestPermission}>
          <Text className="text-[15px] font-semibold text-white">Allow Camera</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  if (phase.tag === 'preview') {
    if (phase.record.type === 'ThaiNationalID') {
      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
          <WalletHeader onBack={resetScanner} />
          <ThaiIdSuccessConfirmationPanel record={phase.record} onConfirm={() => handleSave(phase.record)} />
        </SafeAreaView>
      )
    }

    if (phase.record.type === 'BangkokUniversityTranscript') {
      const preview = readCredentialPreviewDisplay(phase.record)
      const profile = readCredentialHolderProfile(phase.record)
      const getRow = (key: string) => preview.rows.find((r) => r.key === key)?.value
      const thaiFullName = profile.thaiName ?? ''
      const englishFullName = profile.englishName ?? ''
      const dob = profile.birthDate ?? getRow('birthDate')
      const studentId = getRow('studentId')
      const gpa = getRow('gpa')
      const faculty = getRow('faculty')
      const graduationYear = getRow('graduationYear')
      const degree = getRow('degree')
      const expiryDate = phase.record.expiresAt
        ? new Date(phase.record.expiresAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
        : getRow('expiryDate')

      type GridCell = { label: string; value?: string; red?: boolean }
      const gridRows: Array<[GridCell, GridCell]> = [
        [
          { label: 'เลขประจำตัวนิสิต', value: studentId },
          { label: 'Cumulative GPA', value: gpa },
        ],
        [
          { label: 'คณะ', value: faculty },
          { label: 'Graduation Year :', value: graduationYear },
        ],
        [
          { label: 'สาขาวิชา', value: degree },
          { label: 'วันหมดอายุ / Expiry Date', value: expiryDate, red: true },
        ],
      ]

      return (
        <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
          <WalletHeader onBack={resetScanner} />
          <View className="flex-1 bg-[#eef1f4] px-4 pt-6">
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              <View
                className="overflow-hidden rounded-2xl bg-white"
                style={{ elevation: 4, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
                <View className="bg-[#cc0066] px-5 py-3">
                  <Text className="text-[15px] font-extrabold text-white">TRANSCRIPT</Text>
                </View>
                <View className="flex-row px-5 pb-4 pt-5">
                  <Image source={credentialImages.transcript} style={{ width: 90, height: 110, borderRadius: 8 }} resizeMode="contain" />
                  <View className="ml-4 flex-1 justify-center">
                    <Text className="text-[11px] text-[#9aa1ad]">ชื่อ - นามสกุล / Name</Text>
                    <Text className="text-[14px] font-bold leading-5 text-[#071f5f]">{thaiFullName || '-'}</Text>
                    <Text className="text-[12px] leading-4 text-[#9aa1ad]">{englishFullName}</Text>
                    {dob ? (
                      <>
                        <Text className="mt-3 text-[11px] text-[#9aa1ad]">วันเกิด / Date of Birth</Text>
                        <Text className="text-[14px] font-bold text-[#071f5f]">{dob}</Text>
                      </>
                    ) : null}
                  </View>
                </View>
                <View className="mx-5 border-t border-[#e5e7eb]" />
                <View className="px-5 pb-5 pt-3">
                  {gridRows.map((pair, i) => (
                    <View key={i} className="mt-3 flex-row">
                      {pair.map((cell, j) => (
                        <View key={j} className="flex-1">
                          <Text className="text-[11px] text-[#9aa1ad]">{cell.label}</Text>
                          <Text className={`text-[13px] font-bold ${cell.red === true ? 'text-[#c00000]' : 'text-[#123b8c]'}`}>
                            {cell.value ?? '-'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
              <Pressable
                className="mt-5 h-11 items-center justify-center rounded-full bg-[#18a05d]"
                onPress={() => handleSave(phase.record)}>
                <Text className="text-[15px] font-extrabold text-white">ยอมรับ</Text>
              </Pressable>
            </ScrollView>
          </View>
        </SafeAreaView>
      )
    }

    const preview = readCredentialPreviewDisplay(phase.record)

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetScanner} />
        <View className="flex-1 bg-[#eef1f4] px-4 pt-6">
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            <View
              className="overflow-hidden rounded-lg bg-white"
              style={{ elevation: 4, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
              <View className="bg-[#123b8c] px-5 py-3">
                <Text className="text-[13px] font-extrabold text-white">{preview.documentTitle}</Text>
              </View>
              <View className="px-7 pb-6 pt-7">
                <View className="items-center">
                  <Image source={credentialImages[preview.imageKey]} style={{ width: 92, height: 104 }} resizeMode="contain" />
                </View>
                <View className="mt-5">
                  <Text className="text-[16px] font-extrabold leading-[22px] text-[#071f5f]">Information to receive</Text>
                  {preview.rows.map((row) => (
                    <View key={row.key} className="border-b border-[#e5e7eb] py-3">
                      <Text className="text-[12px] leading-4 text-[#9aa1ad]">{row.label}</Text>
                      <Text className="text-[13px] font-bold leading-5 text-[#071f5f]">{row.value}</Text>
                    </View>
                  ))}
                </View>
                <Pressable
                  className="mt-4 h-9 w-28 items-center justify-center self-start rounded-full bg-[#18a05d]"
                  onPress={() => handleSave(phase.record)}>
                  <Text className="text-[14px] font-extrabold text-white">ยอมรับ</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    )
  }

  if (phase.tag === 'txCode') {
    const canContinue = txCode.trim().length > 0

    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetScanner} />
        <View className="flex-1 bg-[#eef1f4] px-4 pt-6">
          <View className="rounded-lg bg-white p-6">
            <Text className="text-[16px] font-extrabold text-[#071f5f]">Transaction code</Text>
            <TextInput
              value={txCode}
              onChangeText={setTxCode}
              keyboardType={phase.offer.txCode?.input_mode === 'numeric' ? 'number-pad' : 'default'}
              placeholder="Enter transaction code"
              placeholderTextColor="#9aa1ad"
              secureTextEntry
              className="mt-3 min-h-[44px] rounded-lg border border-[#d1d5db] px-3 text-[15px] font-semibold text-[#071f5f]"
            />
            <Pressable
              className={`mt-4 h-9 w-28 items-center justify-center rounded-full bg-[#18a05d] ${!canContinue ? 'opacity-45' : ''}`}
              disabled={!canContinue}
              onPress={() => handleTxCodeSubmit(phase.offer)}>
              <Text className="text-[14px] font-extrabold text-white">Continue</Text>
            </Pressable>
            <Pressable className="mt-2 h-8 w-28 items-center justify-center" onPress={resetScanner}>
              <Text className="text-[13px] font-bold text-[#6d7a8d]">Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  if (phase.tag === 'thaIdVerify') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={resetScanner} />
        <ThaIdVerificationPanel onContinue={() => handleThaIdVerified(phase.offer)} />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'success') {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top', 'bottom']}>
        <WalletHeader onBack={goToWalletHome} />
        <ScanSuccessPanel record={phase.record} />
      </SafeAreaView>
    )
  }

  if (phase.tag === 'error') {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-[#f4f6fa] p-6">
        <Text className="mb-5 text-center text-[14px] text-red-600">{phase.message}</Text>
        <Pressable className="items-center rounded-xl bg-wallet-navy px-[18px] py-[14px]" onPress={resetScanner}>
          <Text className="text-[15px] font-semibold text-white">Try Again</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const isLoading = phase.tag === 'resolving' || phase.tag === 'acquiring' || phase.tag === 'saving'
  const loadingLabel =
    phase.tag === 'saving'
      ? 'Saving Credential'
      : phase.tag === 'acquiring'
        ? 'Acquiring Credential'
        : phase.tag === 'resolving'
          ? 'Reading Offer'
          : 'Scan QR code'

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader />

      <View className="relative flex-1 items-center">
        <CameraView
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={isLoading ? undefined : ({ data }) => { void handleBarcode(data) }}
        />
        <View className="w-full items-center bg-black/25 px-4 pb-10 pt-16">
          <Text className="text-3xl font-bold text-blue-700">{loadingLabel}</Text>
        </View>

        {/* Viewfinder box */}
        <View
          className="w-full max-w-[310px] overflow-hidden rounded-[18px]"
          style={{ aspectRatio: 1 }}
          onLayout={(e) => setViewfinderHeight(e.nativeEvent.layout.height)}>
          {/* Corner brackets */}
          <View style={{ position: 'absolute', top: 14, left: 14, width: 36, height: 36, borderTopWidth: 3.5, borderLeftWidth: 3.5, borderColor: 'white', borderTopLeftRadius: 12 }} />
          <View style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderTopWidth: 3.5, borderRightWidth: 3.5, borderColor: 'white', borderTopRightRadius: 12 }} />
          <View style={{ position: 'absolute', bottom: 14, left: 14, width: 36, height: 36, borderBottomWidth: 3.5, borderLeftWidth: 3.5, borderColor: 'white', borderBottomLeftRadius: 12 }} />
          <View style={{ position: 'absolute', bottom: 14, right: 14, width: 36, height: 36, borderBottomWidth: 3.5, borderRightWidth: 3.5, borderColor: 'white', borderBottomRightRadius: 12 }} />

          {/* Animated scan line */}
          {!isLoading && viewfinderHeight > 0 && (
            <Animated.View
              style={{
                position: 'absolute',
                left: 14,
                right: 14,
                height: 2,
                borderRadius: 2,
                backgroundColor: 'rgba(0,40,135,0.55)',
                shadowColor: 'rgba(0,40,135,1)',
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 8,
                shadowOpacity: 0.35,
                top: scanLineAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [
                    Math.round(viewfinderHeight * 0.1),
                    Math.round(viewfinderHeight * 0.88),
                  ],
                }),
              }}
            />
          )}

          {isLoading ? (
            <View className="absolute inset-0 items-center justify-center bg-black/25">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : null}
        </View>

        <View className="w-full flex-1 items-center bg-black/25 px-4 pt-10">
          {isLoading ? (
            <Pressable className="rounded-full bg-white/20 px-6 py-2" onPress={resetScanner}>
              <Text className="text-[14px] font-semibold text-white">Cancel</Text>
            </Pressable>
          ) : (
            <View className="h-9" />
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}
