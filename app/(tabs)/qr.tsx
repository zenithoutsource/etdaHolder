import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WalletHeader } from '../../src/components/WalletHeader';

export default function MyQrScreen() {
  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader />

      <View className="flex-1 items-center bg-wallet-bg px-6 pt-12">
        <Text className="text-center text-[26px] font-bold leading-9 text-[#1a2a42]">My ID Card{'\n'}QR Code</Text>

        <View
          className="mt-8 rounded-[20px] bg-[#001e6e] p-4"
          style={{
            elevation: 6,
            shadowColor: '#002887',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.28,
            shadowRadius: 14,
          }}>
          <View className="h-[210px] w-[210px] items-center justify-center rounded-[10px] bg-white">
            <MaterialCommunityIcons name="qrcode" size={150} color="#0a1432" />
          </View>
        </View>

        <Text className="mt-7 text-center text-base font-semibold leading-7 text-wallet-navy">
          Demo QR placeholder for presentation workflows.
        </Text>
        <Text className="mt-2 text-center text-[13px] leading-5 text-[#6d7a8d]">
          Production credential presentation remains post-v1.
        </Text>
      </View>
    </SafeAreaView>
  );
}
