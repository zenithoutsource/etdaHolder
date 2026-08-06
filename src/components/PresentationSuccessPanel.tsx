import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from './AppButton'

import { THEME } from '../config/themeColors'

type PresentationSuccessPanelProps = {
  title: string
  message: string
  buttonLabel: string
  onDone: () => void
  fullScreen?: boolean
}

export function PresentationSuccessPanel({
  title,
  message,
  buttonLabel,
  onDone,
  fullScreen = false,
}: PresentationSuccessPanelProps) {
  return (
    <View className={fullScreen ? 'flex-1 items-center bg-green-50 px-6 pt-[100px]' : 'rounded-[12px] bg-white px-5 py-8'}>
      <View
        testID="presentation-result-check"
        className={fullScreen ? 'h-[98px] w-[98px] items-center justify-center rounded-full bg-green-500' : 'items-center'}
      >
        <MaterialCommunityIcons
          name={fullScreen ? 'check' : 'check-circle'}
          size={fullScreen ? 72 : 56}
          color={fullScreen ? THEME.white : THEME.successDark}
        />
      </View>
      <Text className={`${fullScreen ? 'mt-7 text-[18px] font-extrabold leading-6 text-black' : 'mt-4 text-lg font-semibold text-ink'} text-center`}>
        {title}
      </Text>
      <Text className={`${fullScreen ? 'mt-4 mb-4 text-[14px] leading-5 text-slate750' : 'mt-2 text-sm text-slate'} text-center`}>
        {message}
      </Text>

      <AppButton
        variant="solid-block"
        label={buttonLabel}
        onPress={onDone}
        className={fullScreen ? 'mt-6 px-28 py-5' : 'mt-6 border-0 bg-wallet-navy py-3'}
        textClassName={fullScreen ? undefined : 'text-center text-sm font-bold'}
      />
    </View>
  )
}
