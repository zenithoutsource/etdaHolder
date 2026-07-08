import { base64UrlDecodeToString } from '../../utils/jwtUtils'

export type Ed25519PublicJwk = {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])

function decodeBase64UrlJson(part: string): Record<string, unknown> {
  const parsed = JSON.parse(base64UrlDecodeToString(part)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('InvalidJwtJson')
  }
  return parsed as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function base58Decode(input: string): Uint8Array {
  let zeros = 0
  for (const char of input) {
    if (char !== '1') break
    zeros += 1
  }

  let value = 0n
  for (const char of input) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index < 0) throw new Error('InvalidBase58')
    value = value * 58n + BigInt(index)
  }

  let hex = value.toString(16)
  if (hex.length % 2 === 1) hex = `0${hex}`
  const decoded = hex.length > 0 ? hex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)) : []
  const bytes = new Uint8Array(zeros + decoded.length)
  bytes.set(decoded, zeros)
  return bytes
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function didKeyToEd25519PublicJwk(didKey: string): Ed25519PublicJwk {
  const did = didKey.startsWith('did:key:') ? didKey : `did:key:${didKey}`
  const multibase = did.slice('did:key:'.length)
  if (!multibase.startsWith('z')) {
    throw new Error('UnsupportedDidKeyEncoding')
  }

  const raw = base58Decode(multibase.slice(1))
  if (
    raw.length < ED25519_MULTICODEC_PREFIX.length + 32 ||
    raw[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    raw[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new Error('UnsupportedDidKeyType')
  }

  const publicKey = raw.slice(ED25519_MULTICODEC_PREFIX.length, ED25519_MULTICODEC_PREFIX.length + 32)
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: bytesToBase64Url(publicKey),
  }
}

export function resolveIssuerPublicJwkFromRawVc(rawVc: string): Ed25519PublicJwk {
  const trimmed = rawVc.trim()
  const issuerJwt = trimmed.includes('~') ? trimmed.split('~')[0]! : trimmed
  const headerPart = issuerJwt.split('.')[0]
  if (!headerPart) {
    throw new Error('InvalidRawVc')
  }

  const header = decodeBase64UrlJson(headerPart)
  const alg = readString(header.alg)
  if (alg !== 'EdDSA') {
    throw new Error(`IssuerAlgUnsupported:${alg ?? 'missing'}`)
  }

  const kid = readString(header.kid)
  if (!kid?.startsWith('did:key:')) {
    throw new Error('IssuerKidNotDidKey')
  }

  return didKeyToEd25519PublicJwk(kid.split('#')[0]!)
}

export function formatVpIssuerPublicKeyEnvLine(jwk: Ed25519PublicJwk): string {
  return `VP_ISSUER_PUBLIC_KEY_JWK=${JSON.stringify(jwk)}`
}
