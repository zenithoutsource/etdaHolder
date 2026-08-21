/**
 * Home/detail status pill: calendar หมดอายุ / ใกล้หมดอายุ beat leftover P3 Inactive.
 */

import { isCredentialExpiringSoon } from './credentialDocumentExpiry'
import type { CredentialInactiveState } from './credentialInactiveState'
import { isStoredCredentialKeyTtlExpired } from './credentialKeyExpiry'
import { readWalletHomeBadgeLabel, WALLET_HOME_COPY } from './walletHomeCopy'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

export type CredentialStatusBadge = {
  label: string
  className: string
}

export function readCredentialStatusBadge(input: {
  inactiveState: CredentialInactiveState
  credential?: VerifiableCredentialRecord
  isVerifiedCredential?: boolean
  isNewCredential?: boolean
  isRenewedActive?: boolean
  now?: Date
}): CredentialStatusBadge | undefined {
  const {
    inactiveState,
    credential,
    isVerifiedCredential = false,
    isNewCredential = false,
    isRenewedActive = false,
    now,
  } = input

  if (
    credential &&
    isCredentialExpiringSoon(credential, now) &&
    (inactiveState.kind === 'active' || inactiveState.kind === 'renewal-required')
  ) {
    return {
      label: WALLET_HOME_COPY.expiringSoonBadge,
      className: 'bg-warning',
    }
  }

  if (inactiveState.kind !== 'active') {
    return {
      label: inactiveState.badgeLabel,
      className: inactiveState.badgeClassName,
    }
  }

  if (credential && isStoredCredentialKeyTtlExpired(credential, now)) {
    return {
      label: WALLET_HOME_COPY.documentExpiredBadge,
      className: 'bg-gray-badge',
    }
  }

  if (isRenewedActive) {
    return {
      label: readWalletHomeBadgeLabel('active'),
      className: 'bg-success',
    }
  }

  if (isVerifiedCredential) {
    return {
      label: readWalletHomeBadgeLabel('verified'),
      className: 'bg-success',
    }
  }

  if (isNewCredential) {
    return {
      label: readWalletHomeBadgeLabel('new'),
      className: 'bg-success',
    }
  }

  return undefined
}
