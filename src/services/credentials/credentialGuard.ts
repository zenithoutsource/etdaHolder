import {
  readCredentialRenewal,
  readCredentialRenewalStatuses,
  type CredentialRenewalRecord,
  type CredentialRenewalState,
} from './credentialKeyRenewal'
import { isCredentialDocumentExpired } from './credentialDocumentExpiry'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const PID_CREDENTIAL_TYPE = 'ThaiNationalID'
const PID_OFFER_IDS = new Set(['thainationalid', 'idcard'])

const BLOCKING_PID_RENEWAL_STATES = new Set<CredentialRenewalState>([
  'renewal-required',
  'renewal-processing',
  'cleanup-pending',
  'old-revoked',
])

type ResolvedOfferLike = {
  credentialConfigurations: { id: string }[]
}

export type PidGateStatus = 'missing' | 'renewal-required' | 'ready'

function readRenewalState(
  credentialId: string,
  renewalStatuses?: Record<string, CredentialRenewalRecord>,
): CredentialRenewalState | undefined {
  if (renewalStatuses) {
    return renewalStatuses[credentialId]?.state
  }

  return readCredentialRenewal(credentialId)?.state
}

export function hasPidCredential(credentials: VerifiableCredentialRecord[]): boolean {
  return credentials.some((credential) => credential.type === PID_CREDENTIAL_TYPE)
}

export function isPidCredentialOffer(offer: ResolvedOfferLike): boolean {
  return offer.credentialConfigurations.some((configuration) => {
    const normalized = configuration.id.toLowerCase()
    return PID_OFFER_IDS.has(normalized) || normalized.includes('idcard')
  })
}

export function hasUsablePidCredential(
  credentials: VerifiableCredentialRecord[],
  renewalStatuses?: Record<string, CredentialRenewalRecord>,
): boolean {
  return credentials.some((credential) => {
    if (credential.type !== PID_CREDENTIAL_TYPE) return false
    if (isCredentialDocumentExpired(credential)) return false

    const state = readRenewalState(credential.id, renewalStatuses)
    if (!state) return true
    return state === 'renewed-active'
  })
}

export function findRenewedActiveCredentialForType(
  credentialType: string,
  credentials: VerifiableCredentialRecord[],
  renewalStatuses?: Record<string, CredentialRenewalRecord>,
): VerifiableCredentialRecord | undefined {
  return credentials.find((credential) => {
    if (credential.type !== credentialType) return false
    return readRenewalState(credential.id, renewalStatuses) === 'renewed-active'
  })
}

export function readPidGateStatus(
  credentials: VerifiableCredentialRecord[],
  renewalStatuses?: Record<string, CredentialRenewalRecord>,
): PidGateStatus {
  if (!hasPidCredential(credentials)) return 'missing'
  if (hasUsablePidCredential(credentials, renewalStatuses)) return 'ready'
  return 'renewal-required'
}

export function canSubmitCredentialRenewal(
  credentialId: string,
  credentials: VerifiableCredentialRecord[],
  renewalStatuses?: Record<string, CredentialRenewalRecord>,
): boolean {
  const renewal = renewalStatuses?.[credentialId] ?? readCredentialRenewal(credentialId)
  if (!renewal || renewal.state !== 'renewal-required') return false

  const credential = credentials.find((entry) => entry.id === credentialId)
  if (!credential) return false

  if (
    credential.type !== PID_CREDENTIAL_TYPE &&
    !hasUsablePidCredential(credentials, renewalStatuses)
  ) {
    return false
  }

  return !findRenewedActiveCredentialForType(credential.type, credentials, renewalStatuses)
}

export function pickPreferredHomeCredential(
  matches: VerifiableCredentialRecord[],
  renewalStatuses: Record<string, CredentialRenewalRecord>,
): VerifiableCredentialRecord | undefined {
  if (matches.length === 0) return undefined

  const presentableMatches = matches.filter(
    (record) => !isCredentialDocumentExpired(record),
  )
  const candidates = presentableMatches.length > 0 ? presentableMatches : matches

  const renewedActive = candidates.find(
    (record) => readRenewalState(record.id, renewalStatuses) === 'renewed-active',
  )
  if (renewedActive) return renewedActive

  const normalActive = candidates.find(
    (record) => readRenewalState(record.id, renewalStatuses) === undefined,
  )
  if (normalActive) return normalActive

  const waiting = candidates.find((record) => {
    const state = readRenewalState(record.id, renewalStatuses)
    return state === 'renewal-required' || state === 'renewal-processing'
  })
  if (waiting) return waiting

  const cleanupPending = candidates.find(
    (record) => readRenewalState(record.id, renewalStatuses) === 'cleanup-pending',
  )
  if (cleanupPending) return cleanupPending

  return candidates[0]
}

export function canRequestCredentialType(
  credentialType: string | undefined,
  credentials: VerifiableCredentialRecord[],
  renewalStatuses?: Record<string, CredentialRenewalRecord>,
): boolean {
  if (!credentialType) return false

  const statuses = renewalStatuses ?? readCredentialRenewalStatuses(credentials)

  if (credentialType === PID_CREDENTIAL_TYPE) {
    if (!hasPidCredential(credentials)) return true

    if (findRenewedActiveCredentialForType(PID_CREDENTIAL_TYPE, credentials, statuses)) {
      return false
    }

    if (hasUsablePidCredential(credentials, statuses)) {
      return false
    }

    return credentials.some((credential) => {
      if (credential.type !== PID_CREDENTIAL_TYPE) return false

      const state = readRenewalState(credential.id, statuses)
      return state === 'renewal-required' || isCredentialDocumentExpired(credential)
    })
  }

  return hasUsablePidCredential(credentials, statuses)
}
