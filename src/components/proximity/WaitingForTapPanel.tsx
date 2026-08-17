import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'

import { THEME } from '../../config/themeColors'

type WaitingForTapPanelProps = {
  preparing?: boolean
  ceilingLabels?: string[]
  onCancel: () => void
}

export function WaitingForTapPanel({
  preparing = false,
  ceilingLabels = [],
  onCancel,
}: WaitingForTapPanelProps) {
  return (
    <View className="rounded-[12px] bg-white px-5 py-8">
      <View className="items-center">
        <MaterialCommunityIcons name="nfc-search-variant" size={56} color={THEME.navy} />
        <Text className="mt-4 text-center text-lg font-semibold text-ink">
          {preparing ? 'Preparing NFC…' : 'Waiting for Tap...'}
        </Text>
        <Text className="mt-2 text-center text-sm text-slate">
          {preparing
            ? 'Keep this screen on. Do not leave until NFC is ready.'
            : 'Keep this screen on. Hold the phone still on the reader until Success. Do not tap and lift.'}
        </Text>
        {ceilingLabels.length > 0 && !preparing ? (
          <Text className="mt-4 text-center text-sm text-slate">
            This tap may share: {ceilingLabels.join(', ')}.
          </Text>
        ) : null}
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
