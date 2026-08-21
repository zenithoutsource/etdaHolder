/**
 * Typed OID4VP failure UI (kind → icon, title, body, CTA).
 * Journey: P4 / My QR.
 * Copy: presentationFailureUi; inline mapping.
 * Map: docs/CODEMAPS/frontend.md#oid4vp-request
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { Text, View } from 'react-native'

import { AppButton } from './AppButton'
import { THEME } from '../config/themeColors'
import type { PresentationFailureKind, PresentationFailureUi } from '../services/vp/presentationFailureUi'

type Props = PresentationFailureUi & {
  presentationOrigin: 'scanned-verifier-qr' | 'wallet-generated-qr'
  onBack: () => void
  onRequest?: () => void
}

const FAILURE_ICON: Record<PresentationFailureKind, keyof typeof MaterialCommunityIcons.glyphMap> = {
  'document-not-stored': 'file-search-outline',
  'claims-incomplete': 'file-alert-outline',
  'metadata-mismatch': 'file-sync-outline',
  'format-mismatch': 'file-code-outline',
  'not-presentable': 'file-clock-outline',
  'issuer-pid-missing': 'card-account-details-outline',
  'pid-required': 'card-account-details-outline',
  'verifier-untrusted': 'shield-alert-outline',
  'issuer-untrusted': 'shield-alert-outline',
  'request-unsupported': 'file-cancel-outline',
  'request-invalid': 'file-remove-outline',
  'request-expired': 'link-off',
  'request-unreachable': 'cloud-off-outline',
  'holder-binding': 'link-variant-off',
  timeout: 'timer-sand',
  'biometric-cancelled': 'fingerprint-off',
  'biometric-unavailable': 'fingerprint-off',
  'biometric-failed': 'fingerprint-off',
  'submission-rejected': 'close-circle-outline',
  'replay-blocked': 'history',
  'security-state': 'shield-lock-outline',
  generic: 'alert-circle-outline',
}

export function PresentationFailurePanel({
  kind,
  title,
  body,
  hint,
  documentLabel,
  missingClaimLabels,
  showRequestButton,
  presentationOrigin,
  onBack,
  onRequest,
}: Props) {
  const returnLabel = presentationOrigin === 'wallet-generated-qr'
    ? 'กลับไปที่ My QR'
    : 'กลับไปที่ Wallet'
  const canRequest = showRequestButton && Boolean(onRequest)

  return (
    <View
      testID="presentation-failure-panel"
      className="flex-1 items-center bg-wallet-bg px-6 pt-16"
    >
      <View className="h-24 w-24 items-center justify-center rounded-full bg-white">
        <MaterialCommunityIcons
          name={FAILURE_ICON[kind]}
          size={52}
          color={THEME.navy}
        />
      </View>

      <Text className="mt-7 text-center text-xl font-extrabold leading-7 text-ink">
        {title}
      </Text>
      <Text className="mt-3 text-center text-sm leading-6 text-gray600">
        {body}
      </Text>

      {documentLabel ? (
        <View className="mt-6 w-full rounded-2xl border border-slate200 bg-white px-5 py-4">
          <Text className="text-center text-xs font-semibold text-gray600">
            เอกสารที่เกี่ยวข้อง
          </Text>
          <Text className="mt-1 text-center text-base font-bold text-wallet-navy">
            {documentLabel}
          </Text>
        </View>
      ) : null}

      {missingClaimLabels && missingClaimLabels.length > 0 ? (
        <View className="mt-4 w-full rounded-2xl border border-amber200 bg-amber-50 px-5 py-4">
          <Text className="text-center text-xs font-semibold text-amber900">
            ข้อมูลที่ยังไม่มีในเอกสาร
          </Text>
          {missingClaimLabels.map((label) => (
            <Text
              key={label}
              className="mt-2 text-center text-sm font-medium text-amber950"
            >
              • {label}
            </Text>
          ))}
        </View>
      ) : null}

      {hint ? (
        <Text className="mt-4 text-center text-xs leading-5 text-gray600">
          {hint}
        </Text>
      ) : null}

      {canRequest ? (
        <AppButton
          testID="presentation-failure-request"
          variant="solid-block"
          label="ขอเอกสาร"
          onPress={onRequest}
          fullWidth
          className="mt-8 rounded-xl py-4"
          textClassName="text-center text-sm font-bold"
        />
      ) : null}
      <AppButton
        testID="presentation-failure-back"
        variant="outline-block"
        label={returnLabel}
        onPress={onBack}
        fullWidth
        className={`${canRequest ? 'mt-3' : 'mt-8'} rounded-xl py-4`}
        textClassName="text-center text-sm font-bold"
      />
    </View>
  )
}

/** @deprecated Use PresentationFailurePanel */
export function PresentationDocumentUnavailablePanel({
  documentLabel,
  presentationOrigin,
  onBack,
  onRequest,
}: {
  documentLabel: string
  presentationOrigin: 'scanned-verifier-qr' | 'wallet-generated-qr'
  onBack: () => void
  onRequest?: () => void
}) {
  return (
    <PresentationFailurePanel
      kind="document-not-stored"
      title="ไม่พบเอกสารที่ใช้ยืนยัน"
      body={`ผู้ตรวจสอบขอเอกสารนี้ แต่ยังไม่มี${documentLabel}ใน Wallet ของคุณ`}
      documentLabel={documentLabel}
      showRequestButton={Boolean(onRequest)}
      presentationOrigin={presentationOrigin}
      onBack={onBack}
      onRequest={onRequest}
    />
  )
}
