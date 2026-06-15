import { Text, View } from 'react-native'

type Props = {
  label: string
  value?: string
  divider?: boolean
}

export function CredentialFieldRow({ label, value, divider = true }: Props) {
  return (
    <>
      {divider ? <View className="mt-3 border-t border-[#e5e7eb]" /> : null}
      <View className="mt-3">
        <Text className="text-[11px] leading-[18px] text-[#9aa1ad]">{label}</Text>
        <Text className="text-[14px] font-extrabold leading-[22px] text-[#071f5f]">{value ?? '-'}</Text>
      </View>
    </>
  )
}
