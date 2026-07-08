import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, View } from 'react-native';

import { THEME } from '../config/themeColors'

export function HistoryEmptyState() {
  return (
    <View className="rounded-[12px] bg-white px-5 py-6">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-lg bg-wallet-bg">
          <MaterialCommunityIcons name="history" size={25} color={THEME.navy} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-ink-gray">ยังไม่มีประวัติ</Text>
          <Text className="mt-1 text-sm leading-5 text-slate500">
            การรับเอกสาร การแสดงเอกสาร (สำเร็จ/ไม่สำเร็จ/ปฏิเสธ) และการจัดการเอกสารจะแสดงขึ้นที่นี่
          </Text>
        </View>
      </View>
    </View>
  );
}
