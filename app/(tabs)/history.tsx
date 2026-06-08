import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStoredCredentials } from '../../src/hooks/useStoredCredentials';
import { readCredentialLifecycleStatuses } from '../../src/services/credentials/credentialLifecycle';
import { readWalletHistory, type WalletHistoryEvent } from '../../src/services/history/walletHistory';

type HistoryTab = 'transactions' | 'presentations';

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function HistoryItem({ item }: { item: WalletHistoryEvent }) {
  const statusConfig = {
    completed: { label: 'สำเร็จ', icon: 'check-circle' as const, color: '#22a65a', bg: '#eaf7ef' },
    revoked: { label: 'ถูกระงับ', icon: 'close-circle' as const, color: '#c00000', bg: '#fff0f0' },
    deleted: { label: 'ถูกลบ', icon: 'trash-can' as const, color: '#c00000', bg: '#fff0f0' },
  }[item.status];

  return (
    <View
      className="rounded-[12px] bg-white px-4 py-3"
      style={{
        elevation: 1,
        shadowColor: '#0f2849',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
      }}>
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-[#eaf0fc]">
          <MaterialCommunityIcons name={statusConfig.icon} size={22} color={statusConfig.color} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-[#1a2a42]" numberOfLines={1}>
            {item.title}
          </Text>
          <Text className="mt-1 text-xs text-[#9aabbf]">{formatDate(item.occurredAt)}</Text>
        </View>
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: statusConfig.bg }}>
          <Text className="text-xs font-semibold" style={{ color: statusConfig.color }}>
            {statusConfig.label}
          </Text>
        </View>
      </View>
      <View className="mt-3 border-t border-[#eef2f8] pt-3">
        <Text className="text-[11px] text-[#8a9bb0]">Activity</Text>
        <Text className="mt-1 text-[13px] font-medium text-[#1a2a42]">{item.subtitle}</Text>
      </View>
    </View>
  );
}

function EmptyState({ tab }: { tab: HistoryTab }) {
  return (
    <View className="rounded-[12px] bg-white px-5 py-6">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-lg bg-wallet-bg">
          <MaterialCommunityIcons name={tab === 'transactions' ? 'history' : 'shield-account'} size={25} color="#002887" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-[#1f2937]">
            {tab === 'transactions' ? 'No wallet transactions yet' : 'Presentation history is post-v1'}
          </Text>
          <Text className="mt-1 text-sm leading-5 text-[#64748b]">
            {tab === 'transactions'
              ? 'Credential save events will appear here after issuance.'
              : 'Verifier presentation protocols are not enabled in this release.'}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function HistoryLogScreen() {
  const [tab, setTab] = useState<HistoryTab>('transactions');
  const { credentials, error } = useStoredCredentials();
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials);
  const history = readWalletHistory(credentials, lifecycleStatuses);
  const items = tab === 'transactions' ? history.transactions : history.presentations;

  return (
    <SafeAreaView className="flex-1 bg-wallet-navy" edges={['top']}>
      <View className="bg-wallet-navy px-6 pb-5 pt-1.5">
        <Text className="text-center text-xl font-semibold text-white">
          {tab === 'transactions' ? 'Wallet Transaction' : 'Present Log'}
        </Text>
      </View>

      <View className="flex-1 bg-wallet-bg">
        <View className="flex-row border-b border-[#e8eef5] bg-white">
          {[
            { id: 'transactions' as const, label: 'Wallet Transaction' },
            { id: 'presentations' as const, label: 'Present Log' },
          ].map((item) => (
            <Pressable
              key={item.id}
              className={`flex-1 border-b-2 px-1 py-3 ${
                tab === item.id ? 'border-wallet-navy' : 'border-transparent'
              }`}
              onPress={() => setTab(item.id)}>
              <Text
                className={`text-center text-[13px] ${
                  tab === item.id ? 'font-semibold text-wallet-navy' : 'font-normal text-[#9aabbf]'
                }`}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 pb-24 pt-4" showsVerticalScrollIndicator={false}>
          <Text className="text-xs text-[#8a9bb0]">Total items</Text>
          <View className="mb-1 flex-row items-end">
            <Text className="text-2xl font-bold text-wallet-navy">{items.length}</Text>
            <Text className="mb-1 ml-1.5 text-[13px] text-[#8a9bb0]">items</Text>
          </View>

          {error ? (
            <View className="rounded-[12px] bg-red-50 px-5 py-4">
              <Text className="text-sm text-red-600">{error}</Text>
            </View>
          ) : null}

          {items.length > 0 ? items.map((item) => <HistoryItem key={item.id} item={item} />) : <EmptyState tab={tab} />}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
