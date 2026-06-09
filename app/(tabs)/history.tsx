import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { WalletHeader } from '../../src/components/WalletHeader';
import { useStoredCredentials } from '../../src/hooks/useStoredCredentials';
import { readCredentialLifecycleStatuses } from '../../src/services/credentials/credentialLifecycle';
import { readWalletHistory, type WalletHistoryEvent } from '../../src/services/history/walletHistory';

type MaterialIconName = keyof typeof MaterialCommunityIcons.glyphMap;

function formatDateParts(value: string): { date: string; time: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: '' };

  return {
    date: new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: 'short', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' }).format(date),
  };
}

function readIssuerIcon(documentType: string): MaterialIconName {
  if (/driving|licence|license/i.test(documentType)) return 'card-account-details-outline';
  if (/transcript|academic/i.test(documentType)) return 'school-outline';
  if (/id|national/i.test(documentType)) return 'account-card-outline';
  return 'file-document-outline';
}

function HistoryItem({ item }: { item: WalletHistoryEvent }) {
  const dateParts = formatDateParts(item.occurredAt);
  const statusConfig = {
    completed: { label: 'สำเร็จ', color: '#118f4b', bg: '#e8f8ef' },
    revoked: { label: 'ถูกระงับ', color: '#c00000', bg: '#fff0f0' },
    deleted: { label: 'ถูกลบ', color: '#c00000', bg: '#fff0f0' },
  }[item.status];

  return (
    <View
      className="overflow-hidden rounded-[12px] bg-white"
      style={{
        elevation: 2,
        shadowColor: '#0f2849',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
      }}>
      <View className="flex-row">
        <View className="w-1.5 bg-wallet-navy" />
        <View className="min-w-0 flex-1 px-3.5 py-3.5">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-[#eef4ff]">
              <MaterialCommunityIcons name={readIssuerIcon(item.documentType)} size={24} color="#002887" />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-[13px] font-semibold text-[#002887]" numberOfLines={1}>
                {item.issuerName}
              </Text>
              <Text className="mt-1 text-xs text-[#6b7280]" numberOfLines={1}>
                {item.documentType}
              </Text>
              <View className="mt-2 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                <Text className="text-[11px] text-[#6b7280]">{dateParts.date}</Text>
                {dateParts.time ? <Text className="text-[11px] text-[#6b7280]">{dateParts.time}</Text> : null}
              </View>
            </View>
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: statusConfig.bg }}>
              <Text className="text-[11px] font-semibold" style={{ color: statusConfig.color }}>
                {statusConfig.label}
              </Text>
            </View>
          </View>

          <View className="mt-3 rounded-lg bg-[#f3f5f8] px-3 py-2.5">
            <Text className="text-[12px] font-medium text-[#364152]" numberOfLines={2}>
              {item.actionLabel}
            </Text>
            <Text className="mt-1 text-[11px] text-[#7b8794]" numberOfLines={1}>
              {item.subtitle}
            </Text>
          </View>

          <View className="mt-3 self-start rounded-full border border-[#d12d2d] px-3 py-1.5">
            <View className="flex-row items-center gap-1.5">
              <MaterialCommunityIcons name="trash-can-outline" size={14} color="#c00000" />
              <Text className="text-[11px] font-semibold text-[#c00000]">ลบรายการ</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View className="rounded-[12px] bg-white px-5 py-6">
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-lg bg-wallet-bg">
          <MaterialCommunityIcons name="history" size={25} color="#002887" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-base font-semibold text-[#1f2937]">ยังไม่มีประวัติ</Text>
          <Text className="mt-1 text-sm leading-5 text-[#64748b]">
            การออกเอกสารและการยื่นแสดงเอกสารยืนยันตัวตนจะแสดงขึ้นที่นี่
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function HistoryLogScreen() {
  const { credentials, error } = useStoredCredentials();
  const lifecycleStatuses = readCredentialLifecycleStatuses(credentials);
  const history = readWalletHistory(credentials, lifecycleStatuses);
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

          {items.length > 0 ? items.map((item) => <HistoryItem key={item.id} item={item} />) : <EmptyState />}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
