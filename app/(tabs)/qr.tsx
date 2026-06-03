import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function MyQrScreen() {
  return (
    <SafeAreaView className="flex-1 bg-wallet-bg px-5 pt-5">
      <Text className="text-center text-xl font-semibold text-[#1f2937]">My QR</Text>
      <View className="mt-8 items-center rounded-lg bg-white px-5 py-8 shadow-sm">
        <View className="h-40 w-40 items-center justify-center rounded-lg bg-slate-100">
          <MaterialCommunityIcons name="qrcode" size={84} color="#002887" />
        </View>
        <Text className="mt-5 text-center text-base font-semibold text-[#1f2937]">
          QR presentation is planned for Phase 3.3.
        </Text>
      </View>
    </SafeAreaView>
  );
}
