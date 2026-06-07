import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard';

export default function HistoryLogScreen() {
  useScreenCaptureGuard();
  return (
    <SafeAreaView className="flex-1 bg-wallet-bg px-5 pt-5">
      <Text className="text-center text-xl font-semibold text-[#1f2937]">History Log</Text>
      <View className="mt-8 rounded-lg bg-white px-5 py-6 shadow-sm">
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-lg bg-wallet-bg">
            <MaterialCommunityIcons name="history" size={25} color="#002887" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold text-[#1f2937]">No activity yet</Text>
            <Text className="mt-1 text-sm text-[#64748b]">
              Credential events will appear here after wallet workflows are connected.
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
