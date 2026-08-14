import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import QRCode from 'react-native-qrcode-svg'
import { Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'

import { THEME } from '../../config/themeColors'

type WaitingForTapPanelProps = {
  deviceEngagementUri?: string | null
  preparing?: boolean
  onCancel: () => void
}

export function WaitingForTapPanel({
  deviceEngagementUri,
  preparing = false,
  onCancel,
}: WaitingForTapPanelProps) {
  return (
    <View className="rounded-[12px] bg-white px-5 py-8">
      <View className="items-center">
        <MaterialCommunityIcons name="nfc-search-variant" size={56} color={THEME.navy} />
        <Text className="mt-4 text-center text-lg font-semibold text-ink">
          {preparing ? 'Preparing NFC…' : 'Waiting for Tap...'}
        </Text>
        {preparing ? (
          <Text className="mt-2 text-center text-sm text-slate">
            Keep this screen on. The engagement QR appears after NFC is armed. Do not tap the reader yet.
          </Text>
        ) : deviceEngagementUri ? (
          <>
            <Text className="mt-2 text-center text-sm text-slate">
              Let the reader scan this QR, then hold your phone near the reader
            </Text>
            <View className="mt-6 rounded-2xl bg-white p-4">
              <QRCode value={deviceEngagementUri} size={200} />
            </View>
          </>
        ) : (
          <Text className="mt-2 text-center text-sm text-slate">
            Hold your phone near the reader
          </Text>
        )}
      </View>
      <AppButton
        variant="outline-block"
        label="Cancel"
        onPress={onCancel}
        className="mt-6 border-slate200 py-3"
        textClassName="text-center text-sm font-semibold text-ink"
      />
    </View>
  )
}
