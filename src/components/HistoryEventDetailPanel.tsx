import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { PresentationDisclosureList } from './PresentationDisclosureList'
import { StatusBadge } from './StatusBadge'
import type { WalletHistoryRow } from '../services/history/walletHistory'

import { THEME } from '../config/themeColors'

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const datePart = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
  const timePart = new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

  return `${datePart} เวลา ${timePart} น.`
}

function readStatusConfig(status: WalletHistoryRow['status']) {
  switch (status) {
    case 'cancelled':
      return { label: 'ปฏิเสธแล้ว', color: THEME.slate, bg: THEME.gray200 }
    case 'failed':
      return { label: 'ไม่สำเร็จ', color: THEME.danger, bg: THEME.dangerTint }
    case 'revoked':
      return { label: 'ถูกระงับ', color: THEME.danger, bg: THEME.dangerTint }
    case 'deleted':
      return { label: 'ถูกลบ', color: THEME.danger, bg: THEME.dangerTint }
    default:
      return { label: 'สำเร็จ', color: THEME.successDeep, bg: THEME.successTint }
  }
}

type HistoryEventDetailPanelProps = {
  row: WalletHistoryRow
  onHide?: () => void
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-[12px] font-semibold text-gray500">{label}</Text>
      <Text className="text-[14px] font-semibold text-ink">{value}</Text>
    </View>
  )
}

export function HistoryEventDetailPanel({ row, onHide }: HistoryEventDetailPanelProps) {
  const statusConfig = readStatusConfig(row.status)
  const disclosureItems = row.disclosedClaims.map((label, index) => ({
    key: `${row.id}:${index}`,
    label,
    status: 'used' as const,
  }))

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-lg font-bold text-wallet-navy">{row.actionLabel}</Text>
        <StatusBadge
          label={statusConfig.label}
          backgroundColor={statusConfig.bg}
          color={statusConfig.color}
          textClassName="text-[11px] font-semibold"
        />
      </View>

      <View className="gap-4 rounded-[12px] bg-white px-4 py-4">
        <DetailField label={row.partyRoleLabel} value={row.partyName} />
        <DetailField label={row.infoBoxLabel} value={row.infoBoxValue} />
        <DetailField label="วันที่และเวลา" value={formatDateTime(row.occurredAt)} />
        <DetailField label="ช่องทาง" value={row.channelCaption} />
        <View className="gap-1">
          <Text className="text-[12px] font-semibold text-gray500">รายละเอียด</Text>
          <Text className="text-[14px] leading-5 text-ink">{row.subtitle}</Text>
        </View>
      </View>

      {disclosureItems.length > 0 ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            <MaterialCommunityIcons name="shield-check-outline" size={20} color={THEME.navy} />
            <Text className="text-[14px] font-bold text-wallet-navy">ข้อมูลที่เปิดเผย</Text>
          </View>
          <PresentationDisclosureList items={disclosureItems} variant="result" />
        </View>
      ) : null}

      {onHide ? (
        <AppButton
          variant="outline-danger"
          label="ซ่อนรายการนี้จากประวัติ"
          onPress={onHide}
          className="rounded-xl px-4 py-3"
          textClassName="text-sm font-semibold"
        />
      ) : null}
    </View>
  )
}
