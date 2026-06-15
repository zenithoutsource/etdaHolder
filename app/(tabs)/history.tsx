import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryEmptyState } from '../../src/components/HistoryEmptyState';
import { HistoryItem } from '../../src/components/HistoryItem';
import { WalletHeader } from '../../src/components/WalletHeader';
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials';
import { readCredentialLifecycleStatuses } from '../../src/services/credentials/credentialLifecycle';
import { readSuccessfulPresentationHistory } from '../../src/services/history/presentationHistory';
import { readWalletHistory } from '../../src/services/history/walletHistory';

export default function HistoryLogScreen() {
  const { credentials, error } = useStoredCredentials();
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials);
  const presentationEvents = readSuccessfulPresentationHistory();
  const history = readWalletHistory(credentials, lifecycleStatuses, presentationEvents);
  const items = [...history.transactions, ...history.presentations].sort(
    (left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt),
  );

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <WalletHeader title="History Log" />

      <View className="flex-1 bg-wallet-bg">
        <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 pb-24 pt-4" showsVerticalScrollIndicator={false}>
          <Text className="text-md text-black">รายการทั้งหมด</Text>
          <View className="mb-1 flex-row items-end">
            <Text className="text-2xl font-bold text-wallet-navy">{items.length}</Text>
            <Text className="mb-1 ml-1.5 text-sm text-black">รายการ</Text>
          </View>

          {error ? (
            <View className="rounded-[12px] bg-red-50 px-5 py-4">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {items.length > 0 ? items.map((item) => <HistoryItem key={item.id} item={item} />) : <HistoryEmptyState />}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
