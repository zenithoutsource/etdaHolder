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
