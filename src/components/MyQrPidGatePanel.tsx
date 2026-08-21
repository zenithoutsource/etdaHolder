/**
 * PID-required gate on the My QR tab before a wallet-initiated VP QR is created.
 * Journey: P4 My QR (app/(tabs)/qr.tsx).
 * Copy: WALLET_HOME_COPY; pidGateDialog present-purpose titles.
 * Layout: WalletHeader stays; My QR title is hidden while this panel is shown.
 * Next: openCredentialRequestPortal('ThaiNationalID') when the CTA is shown.
 * Map: docs/CODEMAPS/frontend.md#my-qr
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { ScrollView, Text, View } from 'react-native'

import { THEME } from '../config/themeColors'
import { readPidGateUserCopy, type BlockingPidGateStatus } from '../services/credentials/pidGateDialog'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'
import { AppButton } from './AppButton'

type MyQrPidGatePanelProps = {
  gateStatus: BlockingPidGateStatus
  onRequestPid: () => void
}

export function MyQrPidGatePanel({ gateStatus, onRequestPid }: MyQrPidGatePanelProps) {
  const copy = readPidGateUserCopy(gateStatus, 'present')
  const showRequestCta =
    gateStatus === 'missing' || gateStatus === 'suspended' || gateStatus === 'document-expired'

  return (
    <View testID="my-qr-pid-gate-panel" className="w-full flex-1">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerClassName="pb-8"
      >
        <View className="items-center rounded-[24px] bg-white px-6 py-8">
          <View className="h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-navy-muted">
            <MaterialCommunityIcons name="card-account-details-outline" size={36} color={THEME.white} />
          </View>

          <Text className="mt-6 text-center text-[22px] font-extrabold text-navy-deep">
            {copy.title}
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-6 text-gray500">{copy.message}</Text>

          <View className="mt-6 w-full gap-3.5 border-t border-gray-light pt-5">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-tint">
                <MaterialCommunityIcons name="qrcode-scan" size={20} color={THEME.navy} />
              </View>
              <Text className="flex-1 text-[13px] font-semibold leading-5 text-navy-deep">
                {WALLET_HOME_COPY.myQrPidGateReason}
              </Text>
            </View>
          </View>

          <View className="mt-5 w-full flex-row items-center gap-2 rounded-xl bg-surface-soft px-4 py-3">
            <MaterialCommunityIcons name="lock-outline" size={18} color={THEME.navyDeep} />
            <Text className="flex-1 text-[12px] leading-5 text-gray500">
              {WALLET_HOME_COPY.myQrPidGateNote}
            </Text>
          </View>

          {showRequestCta ? (
            <AppButton
              testID="my-qr-pid-gate-request"
              variant="solid-block"
              label={WALLET_HOME_COPY.requestThaId}
              iconName="card-account-details-outline"
              iconSize={18}
              onPress={onRequestPid}
              fullWidth
              className="mt-8 py-4"
              accessibilityLabel={WALLET_HOME_COPY.requestThaId}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}
