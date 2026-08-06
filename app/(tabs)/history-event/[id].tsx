import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/src/components/AppButton';
import { HistoryEventDetailPanel } from '@/src/components/HistoryEventDetailPanel';
import { WalletHeader } from '@/src/components/WalletHeader';
import { hideWalletHistoryEvent, readWalletHistoryEvent } from '@/src/services/history/walletEventLog';
import { projectWalletHistoryRow } from '@/src/services/history/walletHistory';

export default function HistoryEventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const event = typeof id === 'string' ? readWalletHistoryEvent(id) : undefined;

  if (!event) {
    return (
      <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
        <WalletHeader title="History Log" onBack={() => router.back()} />
        <View className="flex-1 items-center justify-center bg-wallet-bg px-6">
          <Text className="text-center text-base font-semibold text-ink">ไม่พบรายการนี้</Text>
          <AppButton
            variant="solid-block"
            label="กลับ"
            onPress={() => router.back()}
            className="mt-6 border-0 bg-wallet-navy px-16 py-3"
          />
        </View>
      </SafeAreaView>
    );
  }

  const row = projectWalletHistoryRow(event);

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader title="History Log" onBack={() => router.back()} />
      <View className="flex-1 bg-wallet-bg">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-4 pb-24 pt-4"
          showsVerticalScrollIndicator={false}
        >
          <HistoryEventDetailPanel
            row={row}
            onHide={() => {
              hideWalletHistoryEvent(event.id);
              router.back();
            }}
          />
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
