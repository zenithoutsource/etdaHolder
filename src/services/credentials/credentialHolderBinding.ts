import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import { getHolderDid } from '../crypto/crypto'
import { logWalletError } from '../debug/walletLogger'
import {
  base64UrlDecodeToString,
  readRecord,
} from '@/src/utils/jwtUtils'

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

type CredentialHolderBinding = {
  kid?: string
  jwk?: JsonWebKey
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)
  return n
}

function base58btcEncode(bytes: Uint8Array): string {
  let leadingOnes = 0
  for (const b of bytes) {
    if (b !== 0) break
    leadingOnes++
  }

  let n = bytesToBigInt(bytes)
  let result = ''
  while (n > 0n) {
    const rem = Number(n % 58n)
    result = BASE58_ALPHABET[rem] + result
    n /= 58n
  }

  return '1'.repeat(leadingOnes) + result
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function ed25519DidKeyFromX(x: string): string {
  const publicKey = base64UrlToBytes(x)
  if (publicKey.length !== 32) {
    throw new Error(`InvalidEd25519PublicKeyLength: expected 32 bytes, got ${publicKey.length}`)
  }

  const multicodecBytes = new Uint8Array(ED25519_MULTICODEC_PREFIX.length + publicKey.length)
  multicodecBytes.set(ED25519_MULTICODEC_PREFIX)
  multicodecBytes.set(publicKey, ED25519_MULTICODEC_PREFIX.length)
  return `did:key:z${base58btcEncode(multicodecBytes)}`
}

export function isJwtLikeCredentialRaw(rawVc: string): boolean {
  if (!rawVc || rawVc.startsWith('mdoc:')) return false
  const jwt = rawVc.split('~')[0] ?? rawVc
  return jwt.split('.').length === 3
}

function decodeCredentialPayload(record: VerifiableCredentialRecord): Record<string, unknown> {
  const jwt = record.rawVc.split('~')[0] ?? record.rawVc
  const [, payload] = jwt.split('.')
  if (!payload) {
    throw new Error('CredentialJwtInvalid: JWT payload is required')
  }

  const parsed = JSON.parse(base64UrlDecodeToString(payload)) as unknown
  const decoded = readRecord(parsed)
  if (!decoded) {
    throw new Error('CredentialJwtInvalid: JWT payload is not an object')
  }
  return decoded
}

export function readCredentialHolderBinding(
  record: VerifiableCredentialRecord,
): CredentialHolderBinding | undefined {
  if (!isJwtLikeCredentialRaw(record.rawVc)) {
    return undefined
  }

  try {
    const payload = decodeCredentialPayload(record)
    const cnf = readRecord(payload.cnf)
    if (!cnf) return undefined

    const kid = typeof cnf.kid === 'string' ? cnf.kid : undefined
    const jwk = readRecord(cnf.jwk) as JsonWebKey | undefined

    if (!kid && !jwk) return undefined
    return { kid, jwk }
  } catch (error) {
    logWalletError('credentials', 'holder-binding-read-failed', error, {
      credentialId: record.id,
      credentialType: record.type,
      rawPrefix: record.rawVc.slice(0, 8),
    })
    return undefined
  }
}

export function readCredentialHolderDid(
  record: VerifiableCredentialRecord,
): string | undefined {
  const binding = readCredentialHolderBinding(record)
  if (!binding) return undefined

  if (binding.kid?.startsWith('did:key:')) {
    return binding.kid.split('#')[0]
  }

  if (binding.jwk?.kty === 'OKP' && binding.jwk.crv === 'Ed25519' && typeof binding.jwk.x === 'string') {
    return ed25519DidKeyFromX(binding.jwk.x)
  }

  return undefined
}

export function isCredentialBoundToCurrentWalletKey(
  record: VerifiableCredentialRecord,
): boolean {
  return readCredentialHolderDid(record) === getHolderDid()
}
