import {
  canRequestPresentationAccessSuspension,
  readHiddenWalletHistoryEventIds,
  readWalletHistoryEvents,
  type WalletHistoryEvent,
  type WalletHistoryFailureReason,
} from './walletEventLog'
import {
  matchesWalletHistoryFilter,
  type WalletHistoryFilter,
} from './walletHistoryFilters'

export type WalletHistoryRow = {
  id: string
  credentialId: string
  title: string
  subtitle: string
  partyName: string
  documentType: string
  actionLabel: string
  occurredAt: string
  status: WalletHistoryEvent['status']
  kind: WalletHistoryEvent['kind']
  channel: WalletHistoryEvent['channel']
  disclosedClaims: string[]
  channelCaption: string
  infoBoxLabel: string
  infoBoxValue: string
  partyRoleLabel: string
  showSuspendAccessButton: boolean
  relatedEventId?: string
  reasonCode?: WalletHistoryFailureReason
}

export type SuccessfulPresentationHistoryEvent = {
  id: string
  credentialId: string
  verifierName: string
  documentType: string
  disclosedClaims: string[]
  occurredAt: string
}

export type ReadWalletHistoryRowsOptions = {
  filter?: WalletHistoryFilter
  includeHidden?: boolean
}

function readPresentationAccessSuspendedRelatedIds(
  events: WalletHistoryEvent[],
): Set<string> {
  const suspendedRelatedIds = new Set<string>()
  for (const event of events) {
    if (event.kind === 'presentation-access-suspended' && event.relatedEventId) {
      suspendedRelatedIds.add(event.relatedEventId)
    }
  }
  return suspendedRelatedIds
}

export function readWalletHistoryRows(
  options: ReadWalletHistoryRowsOptions = {},
): WalletHistoryRow[] {
  const filter = options.filter ?? 'issuance'
  const includeHidden = options.includeHidden ?? false
  const hiddenIds = readHiddenWalletHistoryEventIds()
  const events = readWalletHistoryEvents()
  const suspendedRelatedIds = readPresentationAccessSuspendedRelatedIds(events)

  return events
    .filter((event) => includeHidden || !hiddenIds.has(event.id))
    .filter((event) => matchesWalletHistoryFilter(event, filter))
    .map((event) => projectWalletHistoryRow(event, suspendedRelatedIds))
}

export function projectWalletHistoryRow(
  event: WalletHistoryEvent,
  suspendedRelatedIds?: Set<string>,
): WalletHistoryRow {
  const isPresentation = event.kind.startsWith('presentation-') || event.kind.startsWith('nfc-')
  const claimsText = event.disclosedClaims.join(', ')

  return {
    id: event.id,
    credentialId: event.credentialId,
    title: event.documentType,
    subtitle: readSubtitle(event, claimsText),
    partyName: event.partyName,
    documentType: event.documentType,
    actionLabel: readActionLabel(event),
    occurredAt: event.occurredAt,
    status: event.status,
    kind: event.kind,
    channel: event.channel,
    disclosedClaims: event.disclosedClaims,
    channelCaption: readChannelCaption(event),
    infoBoxLabel: isPresentation ? 'ประเภทข้อมูลที่เข้าถึง' : 'เอกสาร',
    infoBoxValue: readInfoBoxValue(event, claimsText),
    partyRoleLabel: readPartyRoleLabel(event),
    showSuspendAccessButton: readShowSuspendAccessButton(event, suspendedRelatedIds),
    relatedEventId: event.relatedEventId,
    reasonCode: event.reasonCode,
  }
}

function readShowSuspendAccessButton(
  event: WalletHistoryEvent,
  suspendedRelatedIds?: Set<string>,
): boolean {
  if (
    event.kind !== 'presentation-success' ||
    (event.channel !== 'oid4vp' && event.channel !== 'wallet')
  ) {
    return false
  }

  if (suspendedRelatedIds) {
    return !suspendedRelatedIds.has(event.id)
  }

  return canRequestPresentationAccessSuspension(event)
}

function readInfoBoxValue(event: WalletHistoryEvent, claimsText: string): string {
  if (event.kind.startsWith('presentation-') || event.kind.startsWith('nfc-')) {
    return claimsText || event.documentType
  }
  return event.documentType
}

function readPartyRoleLabel(event: WalletHistoryEvent): string {
  if (event.kind.startsWith('presentation-') || event.kind.startsWith('nfc-')) {
    return 'ผู้ตรวจสอบ'
  }
  if (event.kind.startsWith('backend-sync')) {
    return 'Backend'
  }
  if (event.kind === 'credential-renewal-completed') {
    return 'Wallet'
  }
  return 'ผู้ออกเอกสาร'
}

function readActionLabel(event: WalletHistoryEvent): string {
  switch (event.kind) {
    case 'credential-received':
      return 'รับเอกสารแล้ว'
    case 'credential-verify-failed':
      return 'ตรวจสอบเอกสารไม่สำเร็จ'
    case 'presentation-success':
    case 'nfc-presentation-success':
      return 'แสดงเอกสารสำเร็จ'
    case 'presentation-declined':
      return 'ปฏิเสธการแสดงเอกสาร'
    case 'presentation-failed':
    case 'nfc-presentation-failed':
      return 'แสดงเอกสารไม่สำเร็จ'
    case 'presentation-access-suspended':
      return 'ขอระงับการเข้าถึงแล้ว'
    case 'credential-revoked':
      return 'ระงับเอกสารแล้ว'
    case 'credential-deleted':
      return 'ลบเอกสารแล้ว'
    case 'credential-used':
      return 'ใช้งานเอกสารแล้ว'
    case 'credential-renewal-completed':
      return 'ต่ออายุเอกสารสำเร็จ'
    case 'backend-sync-success':
      return 'ซิงค์ Backend สำเร็จ'
    case 'backend-sync-failed':
      return 'ซิงค์ Backend ไม่สำเร็จ'
    default:
      return 'รายการประวัติ'
  }
}

function readFailureReasonLabel(reason?: WalletHistoryFailureReason): string {
  switch (reason) {
    case 'verifier-rejected':
      return 'ผู้ตรวจสอบปฏิเสธ'
    case 'network-error':
      return 'เครือข่ายขัดข้อง'
    case 'biometric-cancel':
      return 'ยกเลิกการยืนยันตัวตน'
    case 'timeout':
      return 'หมดเวลา'
    case 'signature-invalid':
      return 'ลายเซ็นไม่ถูกต้อง'
    case 'holder-binding-mismatch':
      return 'ผูกกุญแจผู้ถือไม่ตรง'
    default:
      return 'เกิดข้อผิดพลาด'
  }
}

function readSubtitle(event: WalletHistoryEvent, claimsText: string): string {
  switch (event.kind) {
    case 'credential-received':
      return 'บันทึกเอกสารลง Wallet แล้ว'
    case 'credential-verify-failed':
      return `${readFailureReasonLabel(event.reasonCode)} — ${event.partyName}`
    case 'presentation-success':
    case 'nfc-presentation-success':
      return claimsText ? `ข้อมูลที่เปิดเผย: ${claimsText}` : 'แสดงเอกสารสำเร็จ'
    case 'presentation-declined':
      return `ไม่ยินยอมส่งข้อมูลไปยัง ${event.partyName}`
    case 'presentation-failed':
    case 'nfc-presentation-failed':
      return `${readFailureReasonLabel(event.reasonCode)} — ${event.partyName}`
    case 'presentation-access-suspended':
      return `ส่งคำขอระงับการเข้าถึงไปยัง ${event.partyName}`
    case 'credential-revoked':
      return 'ยืนยันการระงับเอกสารใน Wallet'
    case 'credential-deleted':
      return event.initiatedBy === 'system'
        ? 'เอกสารหมดอายุ — ระบบลบออกจาก Wallet อัตโนมัติ'
        : 'ยืนยันการลบเอกสารใน Wallet'
    case 'credential-used':
      return 'เอกสารถูกใช้สิทธิ์แล้ว — ไม่สามารถแสดงซ้ำได้'
    case 'credential-renewal-completed':
      return 'เอกสารใหม่พร้อมใช้งานหลังต่ออายุ'
    case 'backend-sync-success':
      return 'บันทึกเอกสารไปยัง Backend สำเร็จ'
    case 'backend-sync-failed':
      return readFailureReasonLabel(event.reasonCode)
    default:
      return ''
  }
}

function readChannelCaption(event: WalletHistoryEvent): string {
  if (event.kind === 'presentation-success' && event.channel === 'oid4vp') {
    return 'ผ่าน QR Verifier'
  }
  if (event.kind === 'presentation-success' && event.channel === 'wallet') {
    return 'ผ่าน VP Relay (dev)'
  }
  if (event.kind.startsWith('nfc-') || event.channel === 'nfc') {
    return 'ผ่าน NFC Proximity'
  }
  if (event.kind === 'credential-received') {
    return 'รับเอกสารจาก Issuer'
  }
  if (event.kind === 'credential-verify-failed') {
    return 'ตรวจสอบเอกสารจาก Issuer ไม่ผ่าน'
  }
  if (event.kind === 'credential-renewal-completed') {
    return 'ต่ออายุใน Wallet'
  }
  if (event.kind.startsWith('backend-sync')) {
    return 'ซิงค์ Backend'
  }
  if (event.kind === 'presentation-access-suspended') {
    return 'คำขอระงับการเข้าถึง'
  }
  return 'ดำเนินการใน Wallet'
}
