/**
 * Wallet home hero credential summary (plus empty-card export).
 * Journey: P1 home; P3 renewal overlay.
 * Copy: credentialDisplay; empty message from WALLET_HOME_COPY.
 * Layout: CredentialRenewalOverlay.
 * Map: docs/CODEMAPS/frontend.md#wallet
 */

import { Image, Text, View, type ImageSourcePropType } from 'react-native'

import {
  readCredentialHolderProfile,
  readCredentialSummaryDisplay,
} from '@/src/services/credentials/credentialDisplay'
import type { CredentialInactiveState } from '@/src/services/credentials/credentialInactiveState'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

import { CredentialRenewalOverlay } from './CredentialRenewalOverlay'
import { isFirstPartyDrivingLicence } from '../config/firstPartyCredential'
import { THEME } from '../config/themeColors'

const credentialImages: Record<string, ImageSourcePropType> = {
  profile: require('../../assets/images/profile.png'),
  id: require('../../assets/images/user_profile.png'),
  car: require('../../assets/images/car.png'),
  transcript: require('../../assets/images/transcript.png'),
}

export function WalletCredentialSummaryCard({
  record,
  inactiveState,
}: {
  record: VerifiableCredentialRecord
  inactiveState?: CredentialInactiveState
}) {
  const display = readCredentialSummaryDisplay(record)
  const profile = readCredentialHolderProfile(record)
  const isDrivingLicence = isFirstPartyDrivingLicence(record)
  const identifierRow = isDrivingLicence
    ? display.rows.find((row) => row.key === 'licenceNumber')
    : display.rows.find((row) => row.key === 'nationalId')
  const holderName = profile.thaiName ?? profile.englishName ?? display.primaryText
  const identifierLabel = isDrivingLicence ? 'Licence No. :' : 'ID Card :'
  const identifierValue = identifierRow?.value ?? '-'
  const resolvedInactive = inactiveState ?? { kind: 'active' as const }

  return (
    <View className="relative">
      <View
        className="h-[202px] justify-center overflow-hidden rounded-[18px] bg-navy-alt px-6"
        style={{
          elevation: 5,
          shadowColor: THEME.navyShadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.13,
          shadowRadius: 10,
        }}
      >
        <View className="flex-row items-center gap-6">
          <Image
            source={credentialImages[display.imageKey]}
            style={{ width: 110, height: 140, borderRadius: 30 }}
            resizeMode="cover"
          />
          <View className="min-w-0 flex-1">
            <Text className="text-[12px] leading-6 text-white" numberOfLines={2}>
              {holderName}
            </Text>
            <Text className="mt-2 text-[12px] leading-5 text-white" numberOfLines={2}>
              {identifierLabel} {identifierValue}
            </Text>
          </View>
        </View>
      </View>
      <CredentialRenewalOverlay
        inactiveState={resolvedInactive}
        credential={record}
        showInactiveRosette={false}
      />
    </View>
  )
}

export function WalletEmptyCredentialCard({ message }: { message: string }) {
  return (
    <View
      className="h-[181px] justify-center rounded-[18px] bg-white px-5"
      style={{
        elevation: 5,
        shadowColor: THEME.navyShadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
      }}
    >
      <Text className="text-center text-base font-semibold leading-6 text-gray-400">
        {message}
      </Text>
    </View>
  )
}
