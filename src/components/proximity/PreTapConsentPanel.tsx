import { Pressable, Text, View } from 'react-native'

import { AppButton } from '@/src/components/AppButton'
import type { ReaderProfile } from '@/src/config/readerProfiles'
import { listMdocFieldKeysFromProfile, readerProfileUsesCompanion } from '@/src/config/readerProfiles'

type PreTapConsentPanelProps = {
  profile: ReaderProfile
  onAllow: () => void
  onDeny: () => void
}

export function PreTapConsentPanel({ profile, onAllow, onDeny }: PreTapConsentPanelProps) {
  const mdocFieldKeys = listMdocFieldKeysFromProfile(profile)

  return (
    <View className="rounded-[12px] bg-white px-5 py-6">
      <Text className="text-center text-lg font-semibold text-ink">{profile.profileDisplayName}</Text>
      <Text className="mt-1 text-center text-sm text-ink-muted">
        Vendor: {profile.vendorDisplayName}
      </Text>
      <Text className="mt-3 text-center text-sm text-ink">
        Mode: {profile.sharingMode === 'mdoc-only' ? 'mDOC only' : 'Dual-format (mDOC + companion)'}
      </Text>

      <View className="mt-4 gap-2">
        <Text className="text-sm font-semibold text-ink">mDOC fields to share</Text>
        {mdocFieldKeys.map((fieldKey) => (
          <Text key={fieldKey} className="text-sm text-ink-muted">
            {fieldKey}
          </Text>
        ))}
      </View>

      {readerProfileUsesCompanion(profile) ? (
        <Text className="mt-4 text-sm text-ink-muted">
          Includes a signed SD-JWT companion after mDOC transfer when the reader supports dual-format mode.
        </Text>
      ) : null}

      <View className="mt-6 flex-row justify-center gap-3">
        <Pressable onPress={onDeny} className="rounded-xl border border-ink/20 px-6 py-3">
          <Text className="text-sm font-semibold text-ink">Deny</Text>
        </Pressable>
        <AppButton
          variant="solid-block"
          label="Allow"
          onPress={onAllow}
          className="rounded-xl bg-ink px-8 py-3"
          textClassName="text-sm font-semibold text-white"
        />
      </View>
    </View>
  )
}
