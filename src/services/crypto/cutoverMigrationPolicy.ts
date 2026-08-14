import { getCardSchemaForConfigurationId } from '@/src/config/cardSchemas'
import { isHardwareP256SigningEnabled } from '@/src/config/hardwareSigningPolicy'
import {
  hasUsablePidCredential,
  isPidCredentialOffer,
} from '../credentials/credentialGuard'
import { readStoredCredentials } from '../credentials/storedCredentials'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { listCredentialKeyRecords } from './credentialKeyRegistry'
import { hasHardwareCredentialKey } from './hardwareCredentialSigningKey'
import { logWalletError } from '../debug/walletLogger'

/** PID credential type for cutover ordering (P2 journeys present PID first). */
export const PID_CREDENTIAL_TYPE = 'ThaiNationalID'

export type CutoverBlockReason = 'reissue_pid_first' | 'legacy_key_renewal_unsupported'

export class CutoverMigrationBlockedError extends Error {
  readonly reason: CutoverBlockReason

  constructor(reason: CutoverBlockReason, message: string) {
    super(message)
    this.name = 'CutoverMigrationBlockedError'
    this.reason = reason
  }
}

export type CutoverReissueGateInput = {
  credentialType: string
  hasLegacyEd25519Credentials: boolean
  hasHardwarePidCredential: boolean
}

export type CutoverReissueGateResult =
  | { allowed: true }
  | { allowed: false; reason: CutoverBlockReason; message: string }

/**
 * During Ed25519 → hardware P-256 cutover, block P2 reissue of non-PID credentials
 * until a hardware P-256 PID exists.
 */
export function assessCutoverReissueGate(input: CutoverReissueGateInput): CutoverReissueGateResult {
  if (!input.hasLegacyEd25519Credentials) {
    return { allowed: true }
  }

  if (input.credentialType === PID_CREDENTIAL_TYPE) {
    return { allowed: true }
  }

  if (input.hasHardwarePidCredential) {
    return { allowed: true }
  }

  return {
    allowed: false,
    reason: 'reissue_pid_first',
    message: 'Reissue your national ID (PID) on hardware P-256 before reissuing other credentials.',
  }
}

export function assertCutoverReissueAllowed(input: CutoverReissueGateInput): void {
  const gate = assessCutoverReissueGate(input)
  if (!gate.allowed) {
    throw new CutoverMigrationBlockedError(gate.reason, gate.message)
  }
}

/** P3 old-key renewal presentation is unsupported during hardware P-256 cutover. */
export function rejectLegacyKeyRenewalPresentation(): never {
  throw new CutoverMigrationBlockedError(
    'legacy_key_renewal_unsupported',
    'Legacy key renewal presentation is unsupported; use fresh issuer reissue without old-key proof.',
  )
}

export function isPidCredentialType(credentialType: string): boolean {
  return credentialType === PID_CREDENTIAL_TYPE
}

export type CutoverCredentialSnapshot = Pick<VerifiableCredentialRecord, 'id' | 'type'> &
  Partial<Pick<VerifiableCredentialRecord, 'expiresAt' | 'claims'>>

export type CutoverWalletStateReaders = {
  isHardwareEnabled?: () => boolean
  listLegacyEd25519Keys?: () => { credentialId: string }[]
  readCredentials?: () => CutoverCredentialSnapshot[]
  hasHardwareKey?: (credentialId: string) => boolean
}

type CutoverOfferLike = {
  credentialConfigurations: { id: string }[]
}

type TryReadResult<T> = { ok: true; value: T } | { ok: false }

function resolveHardwareEnabled(readers: CutoverWalletStateReaders = {}): boolean {
  return (readers.isHardwareEnabled ?? isHardwareP256SigningEnabled)()
}

function tryRead<T>(read: () => T, event: string): TryReadResult<T> {
  try {
    return { ok: true, value: read() }
  } catch (error) {
    logWalletError('crypto', event, error)
    return { ok: false }
  }
}

function toUsablePidCheckRecord(credential: CutoverCredentialSnapshot): VerifiableCredentialRecord {
  return {
    id: credential.id,
    type: credential.type,
    rawVc: '',
    issuedAt: '',
    claims: credential.claims ?? {},
    expiresAt: credential.expiresAt,
  }
}

function readDefaultCutoverCredentials(): CutoverCredentialSnapshot[] {
  return readStoredCredentials().map((credential) => ({
    id: credential.id,
    type: credential.type,
    expiresAt: credential.expiresAt,
    claims: credential.claims,
  }))
}

export function readCutoverReissueWalletState(
  readers: CutoverWalletStateReaders = {},
): Omit<CutoverReissueGateInput, 'credentialType'> {
  const listLegacy = readers.listLegacyEd25519Keys ?? listCredentialKeyRecords
  const readCredentials = readers.readCredentials ?? readDefaultCutoverCredentials
  const hasHardwareKey = readers.hasHardwareKey ?? hasHardwareCredentialKey

  const credentialsResult = tryRead(readCredentials, 'cutover-credential-lookup-failed')
  const legacyKeysResult = tryRead(listLegacy, 'cutover-legacy-key-lookup-failed')
  if (!credentialsResult.ok) {
    return {
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: false,
    }
  }

  const wrappedHasHardwareKey = (credentialId: string) => {
    const result = tryRead(
      () => hasHardwareKey(credentialId),
      'cutover-hardware-key-lookup-failed',
    )
    return result.ok ? result.value : false
  }

  const credentials = credentialsResult.value
  const hasLegacyEd25519Credentials =
    (legacyKeysResult.ok && legacyKeysResult.value.length > 0) ||
    credentials.some((credential) => !wrappedHasHardwareKey(credential.id))
  const hardwarePids = credentials.filter(
    (credential) =>
      credential.type === PID_CREDENTIAL_TYPE && wrappedHasHardwareKey(credential.id),
  )
  const usabilityResult = tryRead(
    () => hasUsablePidCredential(hardwarePids.map(toUsablePidCheckRecord)),
    'cutover-pid-usability-lookup-failed',
  )
  const hasHardwarePidCredential = usabilityResult.ok ? usabilityResult.value : false

  return { hasLegacyEd25519Credentials, hasHardwarePidCredential }
}

export function assertHardwareCutoverReissueAllowed(
  credentialType: string,
  readers: CutoverWalletStateReaders = {},
): void {
  if (!resolveHardwareEnabled(readers)) return
  try {
    assertCutoverReissueAllowed({
      credentialType,
      ...readCutoverReissueWalletState(readers),
    })
  } catch (error) {
    logWalletError('crypto', 'cutover-reissue-blocked', error, { credentialType })
    throw error
  }
}

export function resolveCutoverCredentialTypeFromOffer(offer: CutoverOfferLike): string {
  if (isPidCredentialOffer(offer)) return PID_CREDENTIAL_TYPE
  for (const configuration of offer.credentialConfigurations) {
    const schema = getCardSchemaForConfigurationId(configuration.id)
    if (schema.type !== '__fallback__') return schema.type
  }
  return getCardSchemaForConfigurationId(offer.credentialConfigurations[0]?.id).type
}

export function assertHardwareCutoverReissueAllowedForOffer(
  offer: CutoverOfferLike,
  readers: CutoverWalletStateReaders = {},
): void {
  assertHardwareCutoverReissueAllowed(resolveCutoverCredentialTypeFromOffer(offer), readers)
}

export function assertHardwareCutoverLegacyRenewalBlocked(
  readers: Pick<CutoverWalletStateReaders, 'isHardwareEnabled'> = {},
): void {
  if (!resolveHardwareEnabled(readers)) return
  try {
    rejectLegacyKeyRenewalPresentation()
  } catch (error) {
    logWalletError('crypto', 'cutover-legacy-renewal-blocked', error)
    throw error
  }
}
