/**
 * Camera permission gate before the Scan QR viewfinder.
 * Journey: Scan tab (P1 / P4 intake).
 * Copy: inline Thai permission titles, uses, and privacy note.
 * Layout: WalletHeader stays on the Scan screen; this panel fills the body.
 * Next: ScanCaptureSurface after grant.
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Linking, ScrollView, Text, View } from 'react-native'

import { THEME } from '../config/themeColors'
import { logWalletError, logWalletStep } from '../services/debug/walletLogger'
import { AppButton } from './AppButton'

type ScanCameraPermissionPanelProps = {
  canAskAgain: boolean
  onAllow: () => void
  requesting?: boolean
}

function PermissionUseRow({
  icon,
  label,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap
  label: string
}) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-tint">
        <MaterialCommunityIcons name={icon} size={20} color={THEME.navy} />
      </View>
      <Text className="flex-1 text-[13px] font-semibold leading-5 text-navy-deep">{label}</Text>
    </View>
  )
}

async function openCameraSettings() {
  logWalletStep('scan', 'open-camera-settings')
  try {
    await Linking.openSettings()
  } catch (error) {
    logWalletError('scan', 'open-camera-settings-failed', error)
  }
}

export function ScanCameraPermissionPanel({
  canAskAgain,
  onAllow,
  requesting,
}: ScanCameraPermissionPanelProps) {
  const title = canAskAgain ? 'อนุญาตให้ใช้กล้อง' : 'เปิดสิทธิ์กล้องในการตั้งค่า'
  const body = canAskAgain
    ? 'Wallet ใช้กล้องเพื่อสแกน QR สำหรับรับเอกสารและยืนยันตัวตน'
    : 'สิทธิ์กล้องถูกปิดไว้ จึงยังสแกน QR ไม่ได้ กรุณาเปิดกล้องสำหรับการใช้งานแอปนี้ในการตั้งค่าเครื่อง'
  const actionLabel = canAskAgain ? 'อนุญาตใช้กล้อง' : 'เปิดการตั้งค่า'

  function handlePress() {
    if (canAskAgain) {
      onAllow()
      return
    }
    void openCameraSettings()
  }

  return (
    <View testID="scan-camera-permission-panel" className="flex-1 bg-wallet-bg">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="grow justify-center px-5 py-8"
      >
        <View className="items-center rounded-[24px] bg-white px-6 py-8">
          <View className="h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-navy-muted">
            <MaterialCommunityIcons name="qrcode-scan" size={36} color={THEME.white} />
          </View>

          <Text className="mt-6 text-center text-[22px] font-extrabold text-navy-deep">{title}</Text>
          <Text className="mt-2 text-center text-[13px] leading-6 text-gray500">{body}</Text>

          <View className="mt-6 w-full gap-3.5 border-t border-gray-light pt-5">
            <PermissionUseRow icon="file-document-outline" label="สแกน QR เพื่อรับเอกสารใหม่" />
            <PermissionUseRow icon="shield-check-outline" label="สแกน QR จากผู้ตรวจสอบเพื่อแสดงเอกสาร" />
          </View>

          <View className="mt-5 w-full flex-row items-center gap-2 rounded-xl bg-surface-soft px-4 py-3">
            <MaterialCommunityIcons name="lock-outline" size={18} color={THEME.navyDeep} />
            <Text className="flex-1 text-[12px] leading-5 text-gray500">
              กล้องใช้เฉพาะตอนสแกน QR และไม่เก็บรูปของคุณ
            </Text>
          </View>

          <AppButton
            testID="scan-camera-permission-allow"
            variant="solid-block"
            label={actionLabel}
            iconName={canAskAgain ? 'camera-outline' : 'cog-outline'}
            iconSize={18}
            onPress={handlePress}
            loading={requesting}
            fullWidth
            className="mt-8 py-4"
            accessibilityLabel={actionLabel}
          />
        </View>
      </ScrollView>
    </View>
  )
}
