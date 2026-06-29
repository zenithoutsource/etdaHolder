import type { CredentialLifecycleStatus } from './credentialLifecycle'
import type { CredentialRenewalRecord } from './credentialKeyRenewal'
import {
  hasPendingIssuerSuspensionAck,
  type IssuerSuspensionRecord,
} from './issuerSuspension'

type ActiveCredentialState = {
  kind: 'active'
}

type InactiveCredentialState = {
  kind:
    | 'revoked'
    | 'deleted'
    | 'issuer-suspended'
    | 'renewal-required'
    | 'renewal-processing'
    | 'old-revoked'
    | 'cleanup-pending'
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

export function readCredentialInactiveState({
  lifecycleStatus,
  suspensionStatus,
  renewalStatus,
}: {
  lifecycleStatus?: CredentialLifecycleStatus
  suspensionStatus?: IssuerSuspensionRecord
  renewalStatus?: CredentialRenewalRecord
}): CredentialInactiveState {
  if (lifecycleStatus?.status === 'deleted') {
    return {
      kind: 'deleted',
      badgeLabel: 'ถูกลบ',
      badgeClassName: 'bg-[#7a7a7a]',
      panelMessage: 'เอกสารถูกยกเลิกการใช้งาน',
    }
  }

  if (lifecycleStatus?.status === 'revoked') {
    return {
      kind: 'revoked',
      badgeLabel: 'ถูกระงับ',
      badgeClassName: 'bg-[#c00000]',
      panelMessage: 'เอกสารถูกยกเลิกการใช้งาน',
    }
  }

  if (suspensionStatus) {
    return {
      kind: 'issuer-suspended',
      badgeLabel: 'ถูกระงับ',
      badgeClassName: 'bg-[#c00000]',
      panelMessage: 'เอกสารถูกระงับโดยผู้ออกเอกสาร',
    }
  }

  if (renewalStatus?.state === 'renewal-processing') {
    return {
      kind: 'renewal-processing',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-[#7a7a7a]',
      panelMessage: 'ส่งคำขอต่ออายุเอกสารแล้ว กำลังรอผู้ออกเอกสารตรวจสอบ',
    }
  }

  if (renewalStatus?.state === 'old-revoked') {
    return {
      kind: 'old-revoked',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-[#7a7a7a]',
      panelMessage: 'เอกสารเดิมถูกเพิกถอนแล้ว กรุณาตรวจสอบเอกสารใหม่และลบเอกสารเดิม',
    }
  }

  if (renewalStatus?.state === 'cleanup-pending') {
    return {
      kind: 'cleanup-pending',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-[#7a7a7a]',
      panelMessage: 'เอกสารใหม่พร้อมใช้งานแล้ว กรุณาลบเอกสารเดิมเพื่อดำเนินการต่อ',
    }
  }

  if (renewalStatus?.state === 'renewal-required') {
    return {
      kind: 'renewal-required',
      badgeLabel: 'Inactive',
      badgeClassName: 'bg-[#7a7a7a]',
      panelMessage: 'เอกสารผูกกับกุญแจ Wallet ที่หมดอายุแล้ว กรุณาขอเอกสารใหม่',
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
