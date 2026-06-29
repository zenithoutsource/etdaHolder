import { View } from 'react-native'

import { AppButton } from './AppButton'

type CredentialActionMenuProps = {
  onRevoke: () => void
  onDelete: () => void
}

export function CredentialActionMenu({
  onRevoke,
  onDelete,
}: CredentialActionMenuProps) {
  return (
    <View className="absolute right-0 top-10 w-[184px] overflow-hidden rounded-[8px] bg-white shadow-md">
      <AppButton
        variant="icon-circle"
        iconName="file-cancel-outline"
        iconSize={18}
        iconColor="#c00000"
        label="Revoke"
        onPress={onRevoke}
        className="self-stretch justify-start rounded-none border-b border-[#eef2f8] px-3 py-3"
        textClassName="text-sm font-semibold text-[#c00000]"
      />
      <AppButton
        variant="icon-circle"
        iconName="trash-can-outline"
        iconSize={18}
        iconColor="#c00000"
        label="ลบเอกสารนี้"
        onPress={onDelete}
        className="self-stretch justify-start rounded-none px-3 py-3"
        textClassName="text-sm font-semibold text-[#c00000]"
      />
    </View>
  )
}
