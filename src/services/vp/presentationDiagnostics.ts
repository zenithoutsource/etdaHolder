import { ed25519 } from '@noble/curves/ed25519.js'
import { createHash } from 'react-native-quick-crypto'

import { readVerifierDcqlVpTokenShape } from '../../config/runtimeFlags'
import type { ResolvedPresentationRequest } from './presentationService'

type JsonRecord = Record<string, unknown>

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = [0xed, 0x01]

export function describePresentationAttempt(input: {
  request: Pick<ResolvedPresentationRequest, 'clientId' | 'responseUri' | 'nonce' | 'state' | 'dcqlQuery' | 'matchedCredential'>
  vpToken: string
}): string {
  const sdJwtKb = readSdJwtKbParts(input.vpToken)
  const issuerJwt = sdJwtKb.issuerJwt
  const kbJwt = sdJwtKb.kbJwt
  const issuerPayload = decodeJwtPayload(issuerJwt)
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
  const parts = [
    `dcql_ids=${formatList(dcqlCredentials.map((credential) => credential.id))}`,
    `requested_vct=${formatList(dcqlCredentials.flatMap((credential) => credential.meta?.vct_values ?? []))}`,
    `vp_token_response_shape=${input.request.dcqlQuery ? readVerifierDcqlVpTokenShape() : 'raw'}`,
    `state_present=${Boolean(input.request.state)}`,
    `credential_vct=${formatValue(readString(issuerPayload?.vct))}`,
    `credential_cnf_kid=${formatValue(readString(credentialCnf?.kid))}`,
    `credential_cnf_jwk=${credentialCnfJwk ? `${formatValue(readString(credentialCnfJwk.kty))}/${formatValue(readString(credentialCnfJwk.crv))}/${shortValue(readString(credentialCnfJwk.x))}` : 'none'}`,
    `sdjwt_disclosure_count=${sdJwtKb.disclosureCount}`,
    `sdjwt_has_trailing_separator_before_kb=${sdJwtKb.hasTrailingSeparatorBeforeKb}`,
    `client_id=${input.request.clientId}`,
    `response_uri=${input.request.responseUri}`,
    `request_nonce=${input.request.nonce}`,
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
    `kb_signature_self_verifies=${formatOptionalBoolean(verifyKbJwt(kbJwt, kbHeader))}`,
    `kb_iat_age_seconds=${formatNumber(kbIssuedAt === undefined ? undefined : Math.floor(Date.now() / 1000) - kbIssuedAt)}`,
  ]

  return `Presentation debug: ${parts.join('; ')}`
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
  if (!kbJwt || readString(kbHeader?.alg) !== 'EdDSA') return undefined

  const parts = kbJwt.split('.')
  if (parts.length !== 3 || !parts[2]) return false

  const publicKey = readEd25519PublicKey(kbHeader)
  if (!publicKey) return undefined

  try {
    return ed25519.verify(
      base64UrlDecodeToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      publicKey,
    )
  } catch {
    return false
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

function readRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonRecord : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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
