export type HardwareSecurityLevel = 'STRONGBOX' | 'TEE'

export type HardwareSigningPurpose = 'oid4vci' | 'oid4vp' | 'mdoc' | 'attest'

export type EcP256Jwk = {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

export type CreateKeyOptions = {
  attestationChallenge?: Uint8Array
  /** Mock/dev only: force StrongBox path to fail with explicit unavailability. */
  simulateStrongBoxUnavailable?: boolean
  /** Mock/dev only: fail keygen with a generic (non-StrongBox) error. */
  simulateGenericKeygenFailure?: boolean
}

export type CreateKeyResult = {
  publicJwk: EcP256Jwk
  securityLevel: HardwareSecurityLevel
  certificateChainDer?: Uint8Array[]
}

export type OpenSigningSessionOptions = {
  purpose: HardwareSigningPurpose
  maxSignatures: number
}

export type HardwareSigningSession = {
  opaqueNativeHandle: string
  sign(data: Uint8Array): Promise<Uint8Array>
  close(): Promise<void>
}

export class HardwareKeyNotFoundError extends Error {
  readonly alias: string

  constructor(alias: string) {
    super(`Hardware key not found: ${alias}`)
    this.name = 'HardwareKeyNotFoundError'
    this.alias = alias
  }
}

export class HardwareEcdsaUnavailableError extends Error {
  constructor(message = 'HardwareEcdsaUnavailable') {
    super(message)
    this.name = 'HardwareEcdsaUnavailableError'
  }
}

export class HardwareSigningSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HardwareSigningSessionError'
  }
}

export interface HardwareEcdsaSigner {
  createKey(alias: string, options?: CreateKeyOptions): Promise<CreateKeyResult>
  getPublicJwk(alias: string): Promise<EcP256Jwk>
  getSecurityLevel(alias: string): Promise<HardwareSecurityLevel>
  hasKey(alias: string): Promise<boolean>
  openSigningSession(alias: string, options: OpenSigningSessionOptions): Promise<HardwareSigningSession>
  deleteKey(alias: string): Promise<void>
}

export const WALLET_P256_ATTEST_ALIAS = 'wallet.p256.attest'

export function pendingCredentialAlias(pendingId: string): string {
  return `wallet.p256.cred.pending.${pendingId}`
}
