import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { ScrollView, Text, View } from 'react-native'

import type { PresentationDisclosure, ResolvedPresentationRequest } from '../services/vp/presentationService'
import { resolvePresentationDisclosureLabel } from '../config/cardSchemas'
import { resolveEffectiveDisclosureKeys } from '../services/vp/claimDisclosurePolicy'
import { AppButton } from './AppButton'
import { PresentationDisclosureList } from './PresentationDisclosureList'

import { THEME } from '../config/themeColors'

type Props = {
  request: ResolvedPresentationRequest
  selectedClaimKeys: ReadonlySet<string>
  onToggleClaim: (claimKey: string) => void
  onAccept: () => void
  onReject: () => void
  submitting?: boolean
}

export function isMandatoryPresentationDisclosure(disclosure: PresentationDisclosure): boolean {
  return disclosure.mandatory === true
}

export function isToggleablePresentationDisclosure(disclosure: PresentationDisclosure): boolean {
  if (isMandatoryPresentationDisclosure(disclosure)) return false
  if (disclosure.selective === false) return false
  return true
}

export function readConsentItems(
  disclosures: PresentationDisclosure[],
  selectedClaimKeys: ReadonlySet<string>,
  documentType?: string,
) {
  return disclosures.map((disclosure) => ({
    key: disclosure.key,
    label: documentType
      ? resolvePresentationDisclosureLabel(documentType, disclosure.key)
      : disclosure.label,
    value: disclosure.value,
    selected: isMandatoryPresentationDisclosure(disclosure) || disclosure.selective === false
      ? true
      : selectedClaimKeys.has(disclosure.key),
    toggleable: isToggleablePresentationDisclosure(disclosure),
  }))
}

export function hasSelectedClaims(
  disclosures: PresentationDisclosure[],
  selectedClaimKeys: ReadonlySet<string>,
): boolean {
  return resolveEffectiveDisclosureKeys(disclosures, selectedClaimKeys).length > 0
}

export function PresentationConsentPanel({
  request,
  selectedClaimKeys,
  onToggleClaim,
  onAccept,
  onReject,
  submitting,
}: Props) {
  const acceptDisabled = !hasSelectedClaims(request.disclosures, selectedClaimKeys)

  const handleToggleClaim = (claimKey: string) => {
    const disclosure = request.disclosures.find((entry) => entry.key === claimKey)
    if (!disclosure || !isToggleablePresentationDisclosure(disclosure)) return
    onToggleClaim(claimKey)
  }

  return (
    <View className="flex-1 bg-white px-6 pt-8">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="pb-8 items-center">
        <View className="h-[72px] w-[72px] items-center justify-center rounded-2xl bg-navy-muted">
          <MaterialCommunityIcons name="glass-cocktail" size={36} color={THEME.white} />
        </View>

        <Text className="mt-5 text-center text-[18px] font-extrabold text-navy-deep">
          ข้อมูลที่{request.verifier.name}ต้องการ
        </Text>

        <Text className="mt-1 text-[13px] text-gray500">ข้อมูลที่ร้องขอ</Text>

        <View className="mt-5 w-full">
          <PresentationDisclosureList
            items={readConsentItems(request.disclosures, selectedClaimKeys, request.matchedCredential.type)}
            variant="consent"
            onToggle={handleToggleClaim}
          />
        </View>

        <View className="mt-8 w-full flex-row items-center gap-2 rounded-xl bg-surface-soft px-4 py-3">
          <MaterialCommunityIcons name="face-recognition" size={22} color={THEME.navyDeep} />
          <Text className="text-[13px] font-bold text-navy-deep">ต้องใช้การยืนยันตัวตนโดย{'\n'}Face ID</Text>
        </View>

        <AppButton
          variant="solid-block"
          label="รับทราบและยินยอมส่งข้อมูล"
          onPress={onAccept}
          disabled={acceptDisabled}
          loading={submitting}
          className="mt-8 w-full py-4"
        />
        <AppButton
          variant="icon-circle"
          label="ไม่ยินยอม"
          onPress={onReject}
          className="mt-3 w-full rounded-xl border border-gray300 bg-white py-4"
          textClassName="text-[15px] font-bold text-slate750"
        />
      </ScrollView>
    </View>
  )
}

export function readInitialSelectedClaimKeys(disclosures: PresentationDisclosure[]): Set<string> {
  return new Set(
    disclosures
      .filter(
        (disclosure) =>
          isMandatoryPresentationDisclosure(disclosure) ||
          disclosure.selective === false ||
          isToggleablePresentationDisclosure(disclosure),
      )
      .map((disclosure) => disclosure.key),
  )
}

export function readSelectedDisclosureLabels(
  disclosures: PresentationDisclosure[],
  selectedClaimKeys: ReadonlySet<string>,
): string[] {
  return disclosures
    .filter(
      (disclosure) =>
        isMandatoryPresentationDisclosure(disclosure) ||
        disclosure.selective === false ||
        selectedClaimKeys.has(disclosure.key),
    )
    .map((disclosure) => disclosure.label)
}
