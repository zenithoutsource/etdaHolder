/**
 * Pre-tap disclosure consent from the reader profile. Holder may toggle every listed field.
 * Journey: P4 NFC Present (app/(tabs)/present.tsx).
 * Copy: readerProfiles; cardSchemas disclosure labels; presentationVerifierMocks hero icon. Holder lists hide religion; given name above family name.
 * Layout: PresentationDisclosureList.
 * Map: docs/CODEMAPS/frontend.md#present-and-nfc
 */

import { useMemo, useState } from 'react'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Image, Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'
import { PresentationDisclosureList } from '@/src/components/PresentationDisclosureList'
import { resolvePresentationDisclosureLabel } from '@/src/config/cardSchemas'
import {
  readPresentationConsentHeroIcon,
  readPresentationVerifierLogoSource,
} from '@/src/config/presentationVerifierMocks'
import type { ReaderProfile } from '@/src/config/readerProfiles'
import { THEME } from '@/src/config/themeColors'
import { prepareHolderFacingDisclosureItems } from '@/src/services/vp/presentationDisclosureDisplay'

type PreTapConsentPanelProps = {
  profile: ReaderProfile
  onAccept: (selectedKeys: string[]) => void
  onDecline: () => void
  submitting?: boolean
}

export function PreTapConsentPanel({
  profile,
  onAccept,
  onDecline,
  submitting,
}: PreTapConsentPanelProps) {
  const visibleItems = useMemo(
    () =>
      prepareHolderFacingDisclosureItems(
        profile.mdocFields.map((field) => ({
          key: `${field.namespace}.${field.identifier}`,
          label: resolvePresentationDisclosureLabel(profile.documentType, field.identifier),
        })),
      ),
    [profile.documentType, profile.mdocFields],
  )
  const [selectedKeys, setSelectedKeys] = useState(() => new Set(visibleItems.map((item) => item.key)))
  const items = visibleItems.map((item) => ({
    ...item,
    selected: selectedKeys.has(item.key),
    toggleable: true as const,
  }))
  const selectedList = items.filter((item) => item.selected).map((item) => item.key)
  const logoSource = readPresentationVerifierLogoSource(profile.documentType)
  const heroIcon = readPresentationConsentHeroIcon(profile.documentType)

  return (
    <View className="rounded-[12px] bg-white px-6 py-8">
      <View className="items-center">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-2xl bg-navy-muted">
          {logoSource ? (
            <Image
              testID="presentation-consent-verifier-logo"
              source={logoSource}
              className="h-12 w-12"
              resizeMode="contain"
              accessibilityLabel="โลโก้หน่วยงาน"
            />
          ) : heroIcon ? (
            <MaterialCommunityIcons name={heroIcon} size={36} color={THEME.white} />
          ) : null}
        </View>

        <Text className="mt-5 text-center text-[18px] font-extrabold text-navy-deep">
          ข้อมูลที่เครื่องอ่านต้องการ
        </Text>
        <Text className="mt-1 text-[13px] text-gray500">ข้อมูลที่ร้องขอ</Text>
      </View>

      <View className="mt-5 w-full">
        <PresentationDisclosureList
          items={items}
          variant="consent"
          onToggle={(key) => {
            setSelectedKeys((previous) => {
              const next = new Set(previous)
              if (next.has(key)) next.delete(key)
              else next.add(key)
              return next
            })
          }}
        />
      </View>

      <View className="mt-8 w-full flex-row items-center gap-2 rounded-xl bg-surface-soft px-4 py-3">
        <MaterialCommunityIcons name="face-recognition" size={22} color={THEME.navyDeep} />
        <Text className="flex-1 text-[13px] font-bold text-navy-deep">
          ต้องใช้การยืนยันตัวตนโดย Face ID{'\n'}เมื่อแตะเครื่องอ่าน
        </Text>
      </View>

      <AppButton
        variant="solid-block"
        label="รับทราบและยินยอมส่งข้อมูล"
        onPress={() => onAccept(selectedList)}
        loading={submitting}
        disabled={selectedList.length === 0}
        className="mt-8 w-full py-4"
      />
      <AppButton
        variant="outline-block"
        label="ไม่ยินยอม"
        onPress={onDecline}
        className="mt-3 w-full rounded-full border-gray300 py-4"
        textClassName="text-[15px] font-bold text-slate750"
      />
    </View>
  )
}
