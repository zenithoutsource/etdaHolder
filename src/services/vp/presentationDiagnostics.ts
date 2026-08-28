import { hashes, verify } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'
import { createHash } from 'react-native-quick-crypto'

import { readVerifierDcqlVpTokenShape, readWalletDemoInteropEnabled, type VerifierDcqlVpTokenShape } from '../../config/runtimeFlags'
import { readSdJwtDisclosureClaimKeys } from '../debug/agentDebugLog'
import { readRecord, readString } from '../../utils/jwtUtils'
import { verifyEs256CompactJwt } from '../crypto/es256JwtVerify'
import { didKeyToP256PublicJwk } from '../crypto/p256Identity'
import type { ResolvedPresentationRequest } from './presentationService'

if (!hashes.sha512) hashes.sha512 = sha512

type JsonRecord = Record<string, unknown>

export type SafePresentationTransportHint = {
  jweSegments: number
  vpTokenJsonType: 'object' | 'array' | 'string'
  jweAlg?: string
  jweEnc?: string
  jweKidPresent?: boolean
  jweApuPresent?: boolean
  jweApvPresent?: boolean
  jweBytes?: number
  jweHeaderKeys?: string[]
  jweTyp?: string
}

type EncryptedSubmitAttemptBase = {
  request: Pick<ResolvedPresentationRequest, 'responseMode' | 'protocolPath' | 'state' | 'dcqlQuery'>
  jwkCoordPadded?: boolean
  tokenShape?: VerifierDcqlVpTokenShape
  encryptionSelection?: {
    jwksKeyCount: number
    selectedKeyIndex: number
    advertisedEncValues: string[]
    selectedEnc: string
  }
}

type EncryptedSubmitAttemptWithHint = EncryptedSubmitAttemptBase & {
  transportHint: SafePresentationTransportHint
  formattedVpToken?: never
  compactJwe?: never
}

type EncryptedSubmitAttemptWithTokens = EncryptedSubmitAttemptBase & {
  transportHint?: never
  formattedVpToken: string
  compactJwe?: string
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = [0xed, 0x01]

export function describeEncryptedSubmitAttempt(input: EncryptedSubmitAttemptWithHint): string
export function describeEncryptedSubmitAttempt(input: EncryptedSubmitAttemptWithTokens): string
export function describeEncryptedSubmitAttempt(
  input: EncryptedSubmitAttemptBase & {
    formattedVpToken?: string
    compactJwe?: string
    transportHint?: SafePresentationTransportHint
  },
): string {
  const jweSegments = input.compactJwe?.split('.') ?? []
  const protectedHeader = jweSegments[0] ? decodeJwtPart(jweSegments[0], 0) : undefined
  const transportHint = input.transportHint ?? createSafePresentationTransportHint({
    formattedVpToken: input.formattedVpToken ?? '',
    ...(input.compactJwe ? { compactJwe: input.compactJwe } : {}),
  })

  return [
    `response_mode=${input.request.responseMode}`,
    `protocol_path=${input.request.protocolPath}`,
    `jwe_segments=${transportHint.jweSegments}`,
    `jwe_alg=${formatValue(transportHint.jweAlg)}`,
    `jwe_enc=${formatValue(transportHint.jweEnc)}`,
    `jwe_kid=${input.transportHint ? (transportHint.jweKidPresent ? 'present' : 'none') : formatValue(readString(protectedHeader?.kid))}`,
    `jwe_header_keys=${(transportHint.jweHeaderKeys ?? (protectedHeader ? Object.keys(protectedHeader) : [])).join(',') || 'none'}`,
    `jwe_typ=${formatValue(transportHint.jweTyp ?? readString(protectedHeader?.typ))}`,
    `jwe_apu_present=${transportHint.jweApuPresent ?? false}`,
    `jwe_apv_present=${transportHint.jweApvPresent ?? false}`,
    `jwk_coord_padded=${Boolean(input.jwkCoordPadded)}`,
    `jwe_bytes=${transportHint.jweBytes ?? input.compactJwe?.length ?? 0}`,
    `vp_token_json_type=${transportHint.vpTokenJsonType}`,
    `dcql_envelope_shape=${readAttemptedDcqlVpTokenShape(input)}`,
    `state_in_encrypted_payload=${Boolean(input.request.state)}`,
    `demo_interop=${readWalletDemoInteropEnabled()}`,
    `jwks_key_count=${formatNumber(input.encryptionSelection?.jwksKeyCount)}`,
    `selected_key_index=${formatNumber(input.encryptionSelection?.selectedKeyIndex)}`,
    `advertised_enc=${formatList(input.encryptionSelection?.advertisedEncValues ?? [])}`,
    `selected_enc=${formatValue(input.encryptionSelection?.selectedEnc)}`,
  ].join('; ')
}

export function createSafePresentationTransportHint(input: {
  formattedVpToken: string
  compactJwe?: string
}): SafePresentationTransportHint {
  const jweSegments = input.compactJwe?.split('.') ?? []
  const protectedHeader = jweSegments[0] ? decodeJwtPart(jweSegments[0], 0) : undefined

  return {
    jweSegments: jweSegments.length,
    vpTokenJsonType: readVpTokenJsonType(input.formattedVpToken),
    ...(readString(protectedHeader?.alg) ? { jweAlg: readString(protectedHeader?.alg) } : {}),
    ...(readString(protectedHeader?.enc) ? { jweEnc: readString(protectedHeader?.enc) } : {}),
    ...(protectedHeader
      ? {
        jweKidPresent: typeof protectedHeader.kid === 'string',
        jweApuPresent: typeof protectedHeader.apu === 'string',
        jweApvPresent: typeof protectedHeader.apv === 'string',
        jweHeaderKeys: Object.keys(protectedHeader),
        ...(readString(protectedHeader.typ) ? { jweTyp: readString(protectedHeader.typ) } : {}),
      }
      : {}),
    ...(input.compactJwe ? { jweBytes: input.compactJwe.length } : {}),
  }
}

export function describePresentationAttempt(input: {
  request: Pick<ResolvedPresentationRequest, 'clientId' | 'responseUri' | 'nonce' | 'state' | 'dcqlQuery' | 'matchedCredential' | 'transactionData'>
  vpToken: string
  tokenShape?: VerifierDcqlVpTokenShape
}): string {
  const sdJwtKb = readSdJwtKbParts(input.vpToken)
  const issuerJwt = sdJwtKb.issuerJwt
  const kbJwt = sdJwtKb.kbJwt
  const issuerPayload = decodeJwtPayload(issuerJwt)
  const issuerHeader = decodeJwtHeader(issuerJwt)
  const kbHeader = kbJwt ? decodeJwtHeader(kbJwt) : undefined
  const kbPayload = kbJwt ? decodeJwtPayload(kbJwt) : undefined
  const credentialCnf = readRecord(issuerPayload?.cnf)
  const credentialCnfJwk = readRecord(credentialCnf?.jwk)
  const kbHeaderJwk = readRecord(kbHeader?.jwk)
  const kbSdHash = readString(kbPayload?.sd_hash)
  const recomputedSdHash = sdJwtKb.sdJwtWithoutKb
    ? base64UrlEncode(createHash('sha256').update(new TextEncoder().encode(sdJwtKb.sdJwtWithoutKb)).digest())
    : undefined
  const kbIssuedAt = readNumber(kbPayload?.iat)

  const dcqlCredentials = input.request.dcqlQuery?.credentials ?? []
  const dcqlClaimPaths = dcqlCredentials.flatMap((credential) =>
    (credential.claims ?? []).map((claim) => claim.path.join('.')),
  )
  const parts = [
    `dcql_ids=${formatList(dcqlCredentials.map((credential) => credential.id))}`,
    `dcql_claim_paths=${formatList(dcqlClaimPaths)}`,
    `requested_vct=${formatList(dcqlCredentials.flatMap((credential) => credential.meta?.vct_values ?? []))}`,
    `vp_token_response_shape=${readAttemptedDcqlVpTokenShape(input)}`,
    `state_present=${Boolean(input.request.state)}`,
    `credential_vct=${formatValue(readString(issuerPayload?.vct))}`,
    `credential_issued_at=${formatValue(input.request.matchedCredential.issuedAt)}`,
    `credential_iss=${formatValue(readString(issuerPayload?.iss))}`,
    `credential_iss_type=${issuerPayload?.iss === undefined ? 'none' : typeof issuerPayload.iss}`,
    `issuer_jwt_registered_claims=${formatList(
      ['iss', 'sub', 'aud', 'nbf', 'exp', 'iat', 'jti', 'cnf', 'vct', 'status', '_sd', '_sd_alg']
        .filter((claim) => issuerPayload?.[claim] !== undefined),
    )}`,
    `issuer_jwt_typ=${formatValue(readString(issuerHeader?.typ))}`,
    `issuer_jwt_kid_present=${Boolean(readString(issuerHeader?.kid))}`,
    `issuer_jwt_x5c_count=${Array.isArray(issuerHeader?.x5c) ? issuerHeader.x5c.length : 0}`,
    `issuer_sd_count=${formatNumber(Array.isArray(issuerPayload?._sd) ? issuerPayload._sd.length : undefined)}`,
    `status_claim_type=${issuerPayload?.status === undefined ? 'none' : typeof issuerPayload.status}`,
    `status_list_present=${Boolean(readRecord(readRecord(issuerPayload?.status)?.status_list))}`,
    `status_list_idx=${formatNumber(readNumber(readRecord(readRecord(issuerPayload?.status)?.status_list)?.idx))}`,
    `status_list_host=${formatValue(readUrlHost(readString(readRecord(readRecord(issuerPayload?.status)?.status_list)?.uri)))}`,
    `credential_nbf_in_future=${formatOptionalBoolean(isUnixInFuture(readNumber(issuerPayload?.nbf)))}`,
    `credential_exp_in_past=${formatOptionalBoolean(isUnixInPast(readNumber(issuerPayload?.exp)))}`,
    `disclosure_keys_match_dcql_paths=${setsEqual(dcqlClaimPaths, readSdJwtDisclosureClaimKeys(input.vpToken))}`,
    `credential_cnf_kid=${formatValue(readString(credentialCnf?.kid))}`,
    `credential_cnf_jwk=${credentialCnfJwk ? `${formatValue(readString(credentialCnfJwk.kty))}/${formatValue(readString(credentialCnfJwk.crv))}/${shortValue(readString(credentialCnfJwk.x))}` : 'none'}`,
    `sdjwt_disclosure_count=${sdJwtKb.disclosureCount}`,
    `sdjwt_disclosure_keys=${formatList(readSdJwtDisclosureClaimKeys(input.vpToken))}`,
    `sdjwt_has_trailing_separator_before_kb=${sdJwtKb.hasTrailingSeparatorBeforeKb}`,
    `client_id=${input.request.clientId}`,
    `response_uri=${input.request.responseUri}`,
    `request_nonce=${input.request.nonce}`,
    `transaction_data_count=${formatNumber(input.request.transactionData?.entries.length ?? 0)}`,
    `kb_transaction_data_hashes_present=${Array.isArray(kbPayload?.transaction_data_hashes) && kbPayload.transaction_data_hashes.length > 0}`,
    `kb_header_alg=${formatValue(readString(kbHeader?.alg))}`,
    `kb_header_typ=${formatValue(readString(kbHeader?.typ))}`,
    `kb_header_kid=${formatValue(readString(kbHeader?.kid))}`,
    `kb_header_jwk=${kbHeaderJwk ? `${formatValue(readString(kbHeaderJwk.kty))}/${formatValue(readString(kbHeaderJwk.crv))}/${shortValue(readString(kbHeaderJwk.x))}` : 'none'}`,
    `kb_payload_aud=${formatValue(readString(kbPayload?.aud))}`,
    `kb_payload_nonce=${formatValue(readString(kbPayload?.nonce))}`,
    `kb_aud_matches_client_id=${readString(kbPayload?.aud) === input.request.clientId}`,
    `kb_aud_matches_response_uri=${readString(kbPayload?.aud) === input.request.responseUri}`,
    `kb_nonce_matches_request=${readString(kbPayload?.nonce) === input.request.nonce}`,
    `kb_sd_hash_present=${typeof kbPayload?.sd_hash === 'string' && kbPayload.sd_hash.length > 0}`,
    `kb_sd_hash_matches=${formatOptionalBoolean(Boolean(kbSdHash && recomputedSdHash && kbSdHash === recomputedSdHash))}`,
    `kb_header_jwk_matches_cnf_jwk=${formatOptionalBoolean(jwksEqual(kbHeaderJwk, credentialCnfJwk))}`,
    `kb_signature_self_verifies=${formatOptionalBoolean(verifyKbJwt(kbJwt, kbHeader))}`,
    `kb_signature_verifies_against_cnf_jwk=${formatOptionalBoolean(
      verifyEs256KbAgainstJwk(kbJwt, kbHeader, credentialCnfJwk),
    )}`,
    `kb_iat_age_seconds=${formatNumber(kbIssuedAt === undefined ? undefined : Math.floor(Date.now() / 1000) - kbIssuedAt)}`,
  ]

  return `Presentation debug: ${parts.join('; ')}`
}

function readAttemptedDcqlVpTokenShape(input: {
  request: Pick<ResolvedPresentationRequest, 'dcqlQuery'>
  tokenShape?: VerifierDcqlVpTokenShape
}): VerifierDcqlVpTokenShape | 'raw' {
  if (!input.request.dcqlQuery) return 'raw'
  return input.tokenShape ?? readVerifierDcqlVpTokenShape()
}

function readSdJwtKbParts(vpToken: string): {
  issuerJwt: string
  kbJwt?: string
  sdJwtWithoutKb?: string
  disclosureCount: number
  hasTrailingSeparatorBeforeKb: boolean
} {
  const tokenSegments = vpToken.split('~')
  const issuerJwt = tokenSegments[0] ?? vpToken
  const kbIndex = findKbJwtIndex(tokenSegments, issuerJwt)
  if (kbIndex === -1) {
    return {
      issuerJwt,
      disclosureCount: tokenSegments.slice(1).filter(Boolean).length,
      hasTrailingSeparatorBeforeKb: false,
    }
  }

  return {
    issuerJwt,
    kbJwt: tokenSegments[kbIndex],
    sdJwtWithoutKb: `${tokenSegments.slice(0, kbIndex).join('~')}~`,
    disclosureCount: tokenSegments.slice(1, kbIndex).filter(Boolean).length,
    hasTrailingSeparatorBeforeKb: kbIndex > 0,
  }
}

function findKbJwtIndex(tokenSegments: string[], issuerJwt: string): number {
  for (let i = tokenSegments.length - 1; i > 0; i--) {
    const segment = tokenSegments[i]
    if (segment && segment !== issuerJwt && segment.split('.').length === 3) return i
  }
  return -1
}

function decodeJwtHeader(jwt: string): JsonRecord | undefined {
  return decodeJwtPart(jwt, 0)
}

function decodeJwtPayload(jwt: string): JsonRecord | undefined {
  return decodeJwtPart(jwt, 1)
}

function decodeJwtPart(jwt: string, index: number): JsonRecord | undefined {
  const part = jwt.split('.')[index]
  if (!part) return undefined

  try {
    const parsed = JSON.parse(base64UrlDecodeToString(part)) as unknown
    return readRecord(parsed)
  } catch {
    return undefined
  }
}

function readVpTokenJsonType(formattedVpToken: string): 'object' | 'array' | 'string' {
  const trimmed = formattedVpToken.trimStart()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return 'string'

  try {
    const parsed = JSON.parse(formattedVpToken) as unknown
    if (Array.isArray(parsed)) return 'array'
    if (parsed !== null && typeof parsed === 'object') return 'object'
  } catch {
    // Structural diagnostics treat malformed JSON as a raw string.
  }

  return 'string'
}

function base64UrlDecodeToString(value: string): string {
  return new TextDecoder().decode(base64UrlDecodeToBytes(value))
}

function base64UrlDecodeToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function verifyKbJwt(kbJwt: string | undefined, kbHeader: JsonRecord | undefined): boolean | undefined {
  if (!kbJwt || !kbHeader) return undefined

  const alg = readString(kbHeader.alg)
  if (alg === 'ES256') {
    const publicJwk = readP256PublicJwk(kbHeader)
    if (!publicJwk) return undefined
    return verifyEs256CompactJwt(kbJwt, publicJwk)
  }

  if (alg !== 'EdDSA') return undefined

  const parts = kbJwt.split('.')
  if (parts.length !== 3 || !parts[2]) return false

  const publicKey = readEd25519PublicKey(kbHeader)
  if (!publicKey) return undefined

  try {
    return verify(
      base64UrlDecodeToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      publicKey,
    )
  } catch {
    return false
  }
}

/** Verifier typically verifies KB against credential `cnf.jwk` (not only KB header jwk). */
function verifyEs256KbAgainstJwk(
  kbJwt: string | undefined,
  kbHeader: JsonRecord | undefined,
  cnfJwk: JsonRecord | undefined,
): boolean | undefined {
  if (!kbJwt || !kbHeader || !cnfJwk) return undefined
  if (readString(kbHeader.alg) !== 'ES256') return undefined
  if (cnfJwk.kty !== 'EC' || cnfJwk.crv !== 'P-256') return undefined
  if (!readString(cnfJwk.x) || !readString(cnfJwk.y)) return undefined
  return verifyEs256CompactJwt(kbJwt, cnfJwk)
}

function jwksEqual(left: JsonRecord | undefined, right: JsonRecord | undefined): boolean | undefined {
  if (!left || !right) return undefined
  return (
    readString(left.kty) === readString(right.kty) &&
    readString(left.crv) === readString(right.crv) &&
    readString(left.x) === readString(right.x) &&
    readString(left.y) === readString(right.y)
  )
}

function readP256PublicJwk(header: JsonRecord | undefined): Record<string, unknown> | undefined {
  const jwk = readRecord(header?.jwk)
  if (jwk?.kty === 'EC' && jwk.crv === 'P-256') return jwk

  const kid = readString(header?.kid)
  const did = kid?.split('#')[0]
  if (!did?.startsWith('did:key:z')) return undefined

  try {
    return didKeyToP256PublicJwk(did)
  } catch {
    return undefined
  }
}

function readEd25519PublicKey(header: JsonRecord | undefined): Uint8Array | undefined {
  const jwk = readRecord(header?.jwk)
  const jwkPublicKey = readEd25519PublicKeyFromJwk(jwk)
  if (jwkPublicKey) return jwkPublicKey

  return readEd25519PublicKeyFromDidKey(readString(header?.kid))
}

function readEd25519PublicKeyFromJwk(jwk: JsonRecord | undefined): Uint8Array | undefined {
  if (jwk?.kty !== 'OKP' || jwk.crv !== 'Ed25519') return undefined
  const x = readString(jwk.x)
  return x ? base64UrlDecodeToBytes(x) : undefined
}

function readEd25519PublicKeyFromDidKey(kid: string | undefined): Uint8Array | undefined {
  const did = kid?.split('#')[0]
  if (!did?.startsWith('did:key:z')) return undefined

  const multicodecBytes = base58btcDecode(did.slice('did:key:z'.length))
  if (
    multicodecBytes.length !== 34 ||
    multicodecBytes[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    multicodecBytes[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    return undefined
  }
  return multicodecBytes.slice(2)
}

function base58btcDecode(value: string): Uint8Array {
  let n = 0n
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index === -1) return new Uint8Array()
    n = n * 58n + BigInt(index)
  }

  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }

  for (const char of value) {
    if (char !== '1') break
    bytes.unshift(0)
  }

  return new Uint8Array(bytes)
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value)
  return undefined
}

function readUrlHost(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value).hostname
  } catch {
    return undefined
  }
}

function isUnixInFuture(value: number | undefined): boolean | undefined {
  if (value === undefined) return undefined
  return value > Math.floor(Date.now() / 1000)
}

function isUnixInPast(value: number | undefined): boolean | undefined {
  if (value === undefined) return undefined
  return value < Math.floor(Date.now() / 1000)
}

function setsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const rightSet = new Set(right)
  return left.every((value) => rightSet.has(value))
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(',') : 'none'
}

function formatValue(value: string | undefined): string {
  return value ?? 'none'
}

function formatOptionalBoolean(value: boolean | undefined): string {
  return value === undefined ? 'unknown' : String(value)
}

function formatNumber(value: number | undefined): string {
  return value === undefined ? 'unknown' : String(value)
}

function shortValue(value: string | undefined): string {
  if (!value) return 'none'
  if (value.length <= 16) return value
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}
