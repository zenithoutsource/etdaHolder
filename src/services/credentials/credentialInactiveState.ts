import type { CredentialLifecycleStatus } from './credentialLifecycle'
import type { CredentialRenewalRecord } from './credentialKeyRenewal'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import {
  hasPendingIssuerSuspensionAck,
  type IssuerSuspensionRecord,
} from './issuerSuspension'
import { WALLET_HOME_COPY } from './walletHomeCopy'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

type ActiveCredentialState = {
  kind: 'active'
}

type InactiveCredentialState = {
  kind:
    | 'revoked'
    | 'deleted'
    | 'used'
    | 'issuer-suspended'
    | 'renewal-required'
    | 'renewal-processing'
    | 'old-revoked'
    | 'cleanup-pending'
    | 'document-expired'
  badgeLabel: string
  badgeClassName: string
  panelMessage: string
}

export type CredentialInactiveState = ActiveCredentialState | InactiveCredentialState

export type CredentialRevokeBehavior = 'issuer-acknowledgment' | 'holder-revoke'

export function resolveCredentialRevokeBehavior(
  suspensionStatus: IssuerSuspensionRecord | undefined,
): CredentialRevokeBehavior {
  return hasPendingIssuerSuspensionAck(suspensionStatus)
    ? 'issuer-acknowledgment'
    : 'holder-revoke'
}

function readRenewalInactiveState(
  renewalStatus: CredentialRenewalRecord | undefined,
  credential?: VerifiableCredentialRecord,
): CredentialInactiveState | undefined {
  if (!renewalStatus) return undefined
  return readCredentialInactiveState({ renewalStatus, credential }, false)
}

export function readCredentialInactiveState({
  lifecycleStatus,
  suspensionStatus,
  renewalStatus,
  credential,
}: {
  lifecycleStatus?: CredentialLifecycleStatus
  suspensionStatus?: IssuerSuspensionRecord
  renewalStatus?: CredentialRenewalRecord
  credential?: VerifiableCredentialRecord
}, preferRenewalState = true): CredentialInactiveState {
  if (preferRenewalState && !suspensionStatus) {
    const renewalInactiveState = readRenewalInactiveState(renewalStatus, credential)
    if (renewalInactiveState) return renewalInactiveState
  }

  if (lifecycleStatus?.status === 'deleted') {
    return {
      kind: 'deleted',
      badgeLabel: 'ถูกลบ',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารถูกยกเลิกการใช้งาน',
    }
  }

  if (lifecycleStatus?.status === 'revoked') {
    return {
      kind: 'revoked',
      badgeLabel: 'ถูกระงับ',
      badgeClassName: 'bg-danger',
      panelMessage: 'เอกสารถูกยกเลิกการใช้งาน',
    }
  }

  if (lifecycleStatus?.status === 'used') {
    return {
      kind: 'used',
      badgeLabel: 'ใช้งานแล้ว',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารถูกใช้สิทธิ์แล้ว — ไม่สามารถแสดงซ้ำได้',
    }
  }

  if (suspensionStatus) {
    return {
      kind: 'issuer-suspended',
      badgeLabel: 'ถูกระงับ',
      badgeClassName: 'bg-danger',
      panelMessage: 'เอกสารถูกระงับโดยผู้ออกเอกสาร',
    }
  }

  if (renewalStatus?.state === 'renewal-processing') {
    return {
      kind: 'renewal-processing',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'ส่งคำขอต่ออายุเอกสารแล้ว กำลังรอผู้ออกเอกสารตรวจสอบ',
    }
  }

  if (renewalStatus?.state === 'old-revoked') {
    return {
      kind: 'old-revoked',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารเดิมถูกเพิกถอนแล้ว กรุณาตรวจสอบเอกสารใหม่และลบเอกสารเดิม',
    }
  }

  if (renewalStatus?.state === 'renewal-required') {
    return {
      kind: 'renewal-required',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-gray-badge',
      panelMessage: 'เอกสารผูกกับกุญแจ Wallet ที่หมดอายุแล้ว กรุณาขอเอกสารใหม่',
    }
  }

  if (renewalStatus?.state === 'cleanup-pending') {
    if (credential && isCredentialDocumentExpired(credential)) {
      return {
        kind: 'document-expired',
        badgeLabel: WALLET_HOME_COPY.documentExpiredBadge,
        badgeClassName: 'bg-gray-badge',
        panelMessage: WALLET_HOME_COPY.documentExpiredMessage,
      }
    }

    return {
      kind: 'active',
    }
  }

  if (credential && isCredentialDocumentExpired(credential)) {
    return {
      kind: 'document-expired',
      badgeLabel: WALLET_HOME_COPY.documentExpiredBadge,
      badgeClassName: 'bg-gray-badge',
      panelMessage: WALLET_HOME_COPY.documentExpiredMessage,
    }
  }

  if (renewalStatus?.state === 'renewed-active') {
    return {
      kind: 'active',
    }
  }

  return {
    kind: 'active',
  }
}
