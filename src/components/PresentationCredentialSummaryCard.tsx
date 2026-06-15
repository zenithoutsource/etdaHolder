import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Image, Text, View, type ImageSourcePropType } from 'react-native'

import { getCardSchema, type DisplayField } from '../config/cardSchemas'
import { readCredentialDetailDisplay, readCredentialHolderProfile, readDisplayValue } from '../services/credentials/credentialDisplay'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

const portraitImage = require('../../assets/images/user_profile.png') as ImageSourcePropType

type Props = {
  record: VerifiableCredentialRecord
}

function formatThaiDate(value?: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

function resolveSummaryValue(
  record: VerifiableCredentialRecord,
  profile: ReturnType<typeof readCredentialHolderProfile>,
  display: ReturnType<typeof readCredentialDetailDisplay>,
  field: DisplayField,
): string | undefined {
  if (field.key === 'issuedAt') return formatThaiDate(display.issuedAt)
  return (
    readDisplayValue(record.claims, field) ??
    (field.key === 'birthDate' ? profile.birthDate : undefined) ??
    field.staticValue
  )
}

export function PresentationCredentialSummaryCard({ record }: Props) {
  const schema = getCardSchema(record.type)
  const display = readCredentialDetailDisplay(record)
  const profile = readCredentialHolderProfile(record)
  const summaryFields = schema.summaryFields ?? []
  const summaryValues = summaryFields.map((field) => ({
    field,
    value: resolveSummaryValue(record, profile, display, field),
  }))

  return (
    <View
      className="overflow-hidden rounded-2xl bg-white"
      style={{ elevation: 4, shadowColor: '#0f2849', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 }}>
      <View className="flex-row items-center justify-between bg-[#123b8c] px-5 py-3">
        <Text className="text-[15px] font-extrabold text-white">{schema.documentTitle}</Text>
        <View className="h-6 w-6 items-center justify-center rounded-full bg-[#19a957]">
          <MaterialCommunityIcons name="check" size={16} color="#ffffff" />
        </View>
      </View>
      <View className="flex-row px-5 pb-4 pt-5">
        <Image source={portraitImage} style={{ width: 84, height: 100, borderRadius: 8 }} resizeMode="cover" />
        <View className="ml-4 flex-1 justify-center">
          <Text className="border-b border-[#e5e7eb] pb-2 text-[14px] font-extrabold leading-5 text-[#071f5f]">{profile.thaiName ?? '-'}</Text>
          {summaryValues.map(({ field, value }, index) => (
            <View key={field.key} className={index === 0 ? 'border-b border-[#e5e7eb] pb-2' : ''}>
              <Text className="mt-3 text-[11px] text-[#9aa1ad]">{field.label}</Text>
              <Text className="text-[13px] font-extrabold text-[#071f5f]">{value ?? '-'}</Text>
            </View>
          ))}
        </View>
      </View>
      {(schema.summaryRows ?? []).map((row, index) => {
        const divider = schema.summaryRowDivider ?? 'horizontal'
        const showTopBorder = divider === 'horizontal' || divider === 'both'
        const showColumnBorder = divider === 'vertical' || divider === 'both'
        return (
          <View key={index} className={`flex-row px-5 py-3 ${showTopBorder ? 'border-t border-[#e5e7eb]' : ''}`}>
            {row.map((field, columnIndex) => {
              const value = resolveSummaryValue(record, profile, display, field)
              const columnDividerClasses = showColumnBorder && columnIndex > 0 ? 'border-l border-[#e5e7eb] pl-4' : ''
              return (
                <View key={field.key} className={`flex-1 ${columnIndex > 0 ? 'ml-4' : ''} ${columnDividerClasses}`}>
                  <Text className="text-[11px] text-[#9aa1ad]">{field.label}</Text>
                  <Text className="text-[13px] font-extrabold text-[#071f5f]">{value ?? '-'}</Text>
                </View>
              )
            })}
          </View>
        )
      })}
      {!schema.hideSummaryValidityFooter && (
        <View className="flex-row border-t border-[#e5e7eb] px-5 py-3">
          <View className="flex-1">
            <Text className="text-[11px] text-[#123b8c]">วันอนุญาต / Issue Date</Text>
            <Text className="text-[13px] font-extrabold text-[#123b8c]">{formatThaiDate(display.issuedAt) ?? '-'}</Text>
          </View>
          <View className="flex-1 border-l border-[#e5e7eb] pl-4">
            <Text className="text-[11px] text-[#c00000]">วันหมดอายุ / Expiry Date</Text>
            <Text className="text-[13px] font-extrabold text-[#c00000]">{formatThaiDate(display.expiresAt) ?? '-'}</Text>
          </View>
        </View>
      )}
    </View>
  )
}
