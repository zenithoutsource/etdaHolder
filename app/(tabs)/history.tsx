/**
 * History Log tab — filterable issuance / presentation / lifecycle events.
 * Journey: P5 presentation audit; P6 lifecycle.
 * Copy: historyDisplayNames, walletHistoryFilters; default filter issuance.
 * Layout: HistoryFilterChips, HistoryItem, HistoryEmptyState.
 * Next: app/(tabs)/history-event/[id].tsx
 * Map: docs/CODEMAPS/frontend.md#history
 */

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppDialog } from '../../src/components/AppDialog';
import { HistoryEmptyState } from '../../src/components/HistoryEmptyState';
import { HistoryFilterChips } from '../../src/components/HistoryFilterChips';
import { HistoryItem } from '../../src/components/HistoryItem';
import { WalletHeader } from '../../src/components/WalletHeader';
import { useScreenCaptureGuard } from '../../src/hooks/useScreenCaptureGuard';
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials';
import { requestPresentationAccessSuspension } from '../../src/services/history/requestPresentationAccessSuspension';
import { readWalletHistoryEvent } from '../../src/services/history/walletEventLog';
import { readWalletHistoryRows } from '../../src/services/history/walletHistory';
import {
  parseWalletHistoryFilter,
  type WalletHistoryFilter,
} from '../../src/services/history/walletHistoryFilters';

export default function HistoryLogScreen() {
  useScreenCaptureGuard();
  const router = useRouter();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string | string[] }>();
  const requestedFilter = parseWalletHistoryFilter(filterParam);
  const { showDialog } = useAppDialog();
  const { error } = useStoredCredentials();
  const [filter, setFilter] = useState<WalletHistoryFilter>(requestedFilter ?? 'issuance');
  const [refreshTick, setRefreshTick] = useState(0);
  const items = readWalletHistoryRows({ filter });

  const bumpList = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    if (requestedFilter) setFilter(requestedFilter);
  }, [requestedFilter]);

  useFocusEffect(
    useCallback(() => {
      if (requestedFilter) setFilter(requestedFilter);
      bumpList();
    }, [bumpList, requestedFilter]),
  );
  const handleSuspendAccess = useCallback(
    (eventId: string) => {
      const event = readWalletHistoryEvent(eventId);
      if (!event) return;

      showDialog({
        title: 'ขอระงับการเข้าถึง',
        message: `ส่งคำขอให้ ${event.partyName} หยุดใช้ข้อมูลที่แชร์จากรายการนี้หรือไม่?`,
        actions: [
          { label: 'ยกเลิก', variant: 'secondary' },
          {
            label: 'ยืนยัน',
            variant: 'primary',
            onPress: () => {
              void requestPresentationAccessSuspension(event).then(() => bumpList());
            },
          },
        ],
      });
    },
    [bumpList, showDialog],
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

          <HistoryFilterChips value={filter} onChange={setFilter} />

          {error ? (
            <View className="rounded-[12px] bg-red-50 px-5 py-4">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {items.length > 0 ? (
            items.map((item) => (
              <HistoryItem
                key={`${item.id}:${refreshTick}`}
                item={item}
                onPress={() =>
                  router.push({
                    pathname: '/(tabs)/history-event/[id]',
                    params: { id: item.id },
                  })
                }
                onSuspendAccess={
                  item.showSuspendAccessButton
                    ? () => handleSuspendAccess(item.id)
                    : undefined
                }
              />
            ))
          ) : (
            <HistoryEmptyState />
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
