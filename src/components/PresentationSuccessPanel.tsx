import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from './AppButton'
import {
  PresentationDisclosureList,
  type PresentationDisclosureListItem,
} from './PresentationDisclosureList'

type PresentationSuccessPanelProps = {
  title: string
  message: string
  buttonLabel: string
  onDone: () => void
  items?: PresentationDisclosureListItem[]
  fullScreen?: boolean
}

export function PresentationSuccessPanel({
  title,
  message,
  buttonLabel,
  onDone,
  items,
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
          color={fullScreen ? '#ffffff' : '#0f8f4b'}
        />
      </View>
      <Text className={`${fullScreen ? 'mt-7 text-[18px] font-extrabold leading-6 text-black' : 'mt-4 text-lg font-semibold text-[#1a2a42]'} text-center`}>
        {title}
      </Text>
      <Text className={`${fullScreen ? 'mt-4 mb-4 text-[14px] leading-5 text-[#364152]' : 'mt-2 text-sm text-[#6d7a8d]'} text-center`}>
        {message}
      </Text>

      {items && items.length > 0 ? (
        <View className="mt-4 w-full">
          <PresentationDisclosureList items={items} variant="result" />
        </View>
      ) : null}

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
