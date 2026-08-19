import {
  canRequestPresentationAccessSuspension,
  readHiddenWalletHistoryEventIds,
  readWalletHistoryEvents,
  type WalletHistoryEvent,
  type WalletHistoryEventKind,
  type WalletHistoryFailureReason,
} from './walletEventLog'
import {
  matchesWalletHistoryFilter,
  type WalletHistoryFilter,
} from './walletHistoryFilters'
import {
  inferCredentialTypeFromDocumentType,
  projectHistoryDisclosedClaims,
  projectHistoryDocumentType,
  projectHistoryInfoBoxValue,
  projectHistoryPartyName,
} from '../../config/historyDisplayNames'
import { WALLET_HISTORY_COPY } from '../../config/walletHistoryCopy'

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
  credentialType?: string
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
  const credentialType =
    event.credentialType ?? inferCredentialTypeFromDocumentType(event.documentType)
  const disclosedClaims = projectHistoryDisclosedClaims({
    disclosedClaims: event.disclosedClaims,
    credentialType,
  })
  const claimsText = disclosedClaims.join(', ')
  const documentType = projectHistoryDocumentType({
    documentType: event.documentType,
    credentialType,
  })
  const partyName = projectHistoryPartyName({
    partyName: event.partyName,
    kind: event.kind,
    channel: event.channel,
    credentialType,
  })

  return {
    id: event.id,
    credentialId: event.credentialId,
    title: documentType,
    subtitle: readSubtitle({ ...event, partyName }, claimsText),
    partyName,
    documentType,
    actionLabel: readActionLabel(event),
    occurredAt: event.occurredAt,
    status: event.status,
    kind: event.kind,
    channel: event.channel,
    disclosedClaims,
    channelCaption: readChannelCaption(event),
    infoBoxLabel: isPresentation
      ? WALLET_HISTORY_COPY.infoBoxLabelPresentation
      : WALLET_HISTORY_COPY.infoBoxLabelDocument,
    infoBoxValue: projectHistoryInfoBoxValue({
      kind: event.kind,
      disclosedClaims,
      documentType: event.documentType,
      credentialType,
    }),
    partyRoleLabel: readPartyRoleLabel(event),
    showSuspendAccessButton: readShowSuspendAccessButton(event, suspendedRelatedIds),
    ...(credentialType ? { credentialType } : {}),
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

function readPartyRoleLabel(event: WalletHistoryEvent): string {
  if (event.kind.startsWith('presentation-') || event.kind.startsWith('nfc-')) {
    return WALLET_HISTORY_COPY.partyRoleVerifier
  }
  if (event.kind.startsWith('backend-sync')) {
    return WALLET_HISTORY_COPY.partyRoleBackend
  }
  if (event.kind === 'credential-renewal-completed') {
    return WALLET_HISTORY_COPY.partyRoleWallet
  }
  return WALLET_HISTORY_COPY.partyRoleIssuer
}

function readActionLabel(event: WalletHistoryEvent): string {
  switch (event.kind) {
    case 'credential-received':
      return WALLET_HISTORY_COPY.actionReceived
    case 'credential-verify-failed':
      return WALLET_HISTORY_COPY.actionVerifyFailed
    case 'presentation-success':
    case 'nfc-presentation-success':
      return WALLET_HISTORY_COPY.actionPresentationSuccess
    case 'presentation-declined':
      return WALLET_HISTORY_COPY.actionPresentationDeclined
    case 'presentation-failed':
    case 'nfc-presentation-failed':
      return WALLET_HISTORY_COPY.actionPresentationFailed
    case 'presentation-access-suspended':
      return WALLET_HISTORY_COPY.actionAccessSuspended
    case 'credential-revoked':
      return WALLET_HISTORY_COPY.actionRevoked
    case 'credential-deleted':
      return WALLET_HISTORY_COPY.actionDeleted
    case 'credential-used':
      return WALLET_HISTORY_COPY.actionUsed
    case 'credential-renewal-completed':
      return WALLET_HISTORY_COPY.actionRenewal
    case 'backend-sync-success':
      return WALLET_HISTORY_COPY.actionBackendSuccess
    case 'backend-sync-failed':
      return WALLET_HISTORY_COPY.actionBackendFailed
    default:
      return WALLET_HISTORY_COPY.actionDefault
  }
}

function readFailureReasonLabel(reason?: WalletHistoryFailureReason): string {
  switch (reason) {
    case 'verifier-rejected':
      return WALLET_HISTORY_COPY.failureVerifierRejected
    case 'network-error':
      return WALLET_HISTORY_COPY.failureNetwork
    case 'biometric-cancel':
      return WALLET_HISTORY_COPY.failureBiometric
    case 'timeout':
      return WALLET_HISTORY_COPY.failureTimeout
    case 'signature-invalid':
      return WALLET_HISTORY_COPY.failureSignature
    case 'holder-binding-mismatch':
      return WALLET_HISTORY_COPY.failureHolderBinding
    default:
      return WALLET_HISTORY_COPY.failureUnknown
  }
}

function readSubtitle(
  event: Pick<WalletHistoryEvent, 'kind' | 'partyName' | 'reasonCode' | 'initiatedBy'>,
  claimsText: string,
): string {
  switch (event.kind) {
    case 'credential-received':
      return WALLET_HISTORY_COPY.subtitleReceived
    case 'credential-verify-failed':
      return `${readFailureReasonLabel(event.reasonCode)} — ${event.partyName}`
    case 'presentation-success':
    case 'nfc-presentation-success':
      return claimsText
        ? `ข้อมูลที่เปิดเผย: ${claimsText}`
        : WALLET_HISTORY_COPY.subtitlePresentationSuccess
    case 'presentation-declined':
      return `ไม่ยินยอมส่งข้อมูลไปยัง ${event.partyName}`
    case 'presentation-failed':
    case 'nfc-presentation-failed':
      return `${readFailureReasonLabel(event.reasonCode)} — ${event.partyName}`
    case 'presentation-access-suspended':
      return `ส่งคำขอระงับการเข้าถึงไปยัง ${event.partyName}`
    case 'credential-revoked':
      return WALLET_HISTORY_COPY.subtitleRevoked
    case 'credential-deleted':
      return event.initiatedBy === 'system'
        ? WALLET_HISTORY_COPY.subtitleDeletedSystem
        : WALLET_HISTORY_COPY.subtitleDeletedHolder
    case 'credential-used':
      return WALLET_HISTORY_COPY.subtitleUsed
    case 'credential-renewal-completed':
      return WALLET_HISTORY_COPY.subtitleRenewal
    case 'backend-sync-success':
      return WALLET_HISTORY_COPY.subtitleBackendSuccess
    case 'backend-sync-failed':
      return readFailureReasonLabel(event.reasonCode)
    default:
      return ''
  }
}

function readOid4vpChannelCaption(event: WalletHistoryEvent): string | undefined {
  const oid4vpKinds = new Set<WalletHistoryEventKind>([
    'presentation-success',
    'presentation-failed',
    'presentation-declined',
  ])
  if (!oid4vpKinds.has(event.kind) || event.channel !== 'oid4vp') return undefined

  if (event.deliveryPath === 'qr') return WALLET_HISTORY_COPY.channelQrVerifier
  if (event.deliveryPath === 'deep-link') return WALLET_HISTORY_COPY.channelDeepLinkVerifier
  if (event.kind === 'presentation-success') return WALLET_HISTORY_COPY.channelQrVerifier
  return WALLET_HISTORY_COPY.channelInWallet
}

function readIssuanceChannelCaption(event: WalletHistoryEvent): string | undefined {
  if (event.kind === 'credential-received') {
    if (event.deliveryPath === 'qr') return WALLET_HISTORY_COPY.channelQrIssuer
    if (event.deliveryPath === 'deep-link') return WALLET_HISTORY_COPY.channelDeepLinkIssuer
    return WALLET_HISTORY_COPY.channelReceiveIssuer
  }
  if (event.kind === 'credential-verify-failed') {
    if (event.deliveryPath === 'qr') return WALLET_HISTORY_COPY.channelVerifyFailedQr
    if (event.deliveryPath === 'deep-link') return WALLET_HISTORY_COPY.channelVerifyFailedDeepLink
    return WALLET_HISTORY_COPY.channelVerifyFailedIssuer
  }
  return undefined
}

function readChannelCaption(event: WalletHistoryEvent): string {
  const oid4vpCaption = readOid4vpChannelCaption(event)
  if (oid4vpCaption) return oid4vpCaption

  const issuanceCaption = readIssuanceChannelCaption(event)
  if (issuanceCaption) return issuanceCaption

  if (event.kind === 'presentation-success' && event.channel === 'wallet') {
    return WALLET_HISTORY_COPY.channelVpRelay
  }
  if (event.kind.startsWith('nfc-') || event.channel === 'nfc') {
    return WALLET_HISTORY_COPY.channelNfc
  }
  if (event.kind === 'credential-renewal-completed') {
    return WALLET_HISTORY_COPY.channelRenewal
  }
  if (event.kind.startsWith('backend-sync')) {
    return WALLET_HISTORY_COPY.channelBackend
  }
  if (event.kind === 'presentation-access-suspended') {
    return WALLET_HISTORY_COPY.channelAccessSuspended
  }
  return WALLET_HISTORY_COPY.channelInWallet
}
