import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CredentialMenuItem = {
  id: string;
  title: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  badge?: string;
};

const credentialMenu: CredentialMenuItem[] = [
  { id: 'id-card', title: 'ID Card', icon: 'card-account-details-outline' },
  { id: 'driving-license', title: 'Driving License', icon: 'car-outline' },
  { id: 'transcript', title: 'Transcript', icon: 'school-outline' },
  { id: 'medical-certificate', title: 'Medical certificate', icon: 'medical-bag', badge: 'ขอเอกสาร' },
];

export default function WalletHomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-wallet-bg" edges={['top']}>
      <View className="bg-wallet-navy px-6 pb-5 pt-1.5">
        <Text className="text-center text-2xl font-semibold tracking-wide text-white">Wallet</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3.5 px-4 pb-24 pt-5"
        showsVerticalScrollIndicator={false}>

        <View
          className="flex-row items-center gap-[18px] overflow-hidden rounded-[18px] bg-wallet-card p-5"
          style={{ elevation: 5, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.13, shadowRadius: 10 }}>
          <View className="h-[141px] w-[120px] items-center justify-center rounded-xl bg-white/15">
            <Text className="text-4xl font-bold text-white">ET</Text>
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-base font-semibold leading-snug text-white">ETDA Wallet Holder</Text>
            <Text className="mt-1.5 text-[13px] text-white/65">Holder ID: etda-wallet-demo</Text>
          </View>
        </View>

        <View className="gap-2.5">
          {credentialMenu.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              className="flex-row items-center rounded-[14px] bg-white px-[18px] py-4 active:scale-[0.98]"
              style={{ elevation: 2, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 }}>
              <View className="h-11 w-11 items-center justify-center">
                <MaterialCommunityIcons name={item.icon} size={32} color="#002887" />
              </View>
              <Text className="ml-3.5 flex-1 text-base font-medium text-[#1a2a42]">{item.title}</Text>
              {item.badge ? (
                <View className="rounded-full bg-wallet-navy px-3.5 py-1.5">
                  <Text className="text-[13px] font-medium text-white">{item.badge}</Text>
                </View>
              ) : (
                <MaterialCommunityIcons name="chevron-right" size={24} color="#6d7a8d" />
              )}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
