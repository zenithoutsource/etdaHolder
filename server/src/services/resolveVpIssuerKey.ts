import type { Ed25519PublicJwk } from '../config'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01])

export function decodeBase64UrlJson(part: string): Record<string, unknown> {
  const parsed = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('InvalidJwtJson')
  }
  return parsed as Record<string, unknown>
}

export function readIssuerJwtParts(rawVc: string): {
  header: Record<string, unknown>
  payload: Record<string, unknown>
} {
  const trimmed = rawVc.trim()
  const issuerJwt = trimmed.includes('~') ? trimmed.split('~')[0]! : trimmed
  const [headerPart, payloadPart] = issuerJwt.split('.')
  if (!headerPart || !payloadPart) {
    throw new Error('InvalidRawVc: expected issuer JWT before first ~')
  }
  return {
    header: decodeBase64UrlJson(headerPart),
    payload: decodeBase64UrlJson(payloadPart),
  }
}

function base58Decode(input: string): Buffer {
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
  const decoded = hex.length > 0 ? Buffer.from(hex, 'hex') : Buffer.alloc(0)
  return Buffer.concat([Buffer.alloc(zeros), decoded])
}

export function didKeyToEd25519PublicJwk(didKey: string): Ed25519PublicJwk {
  const did = didKey.startsWith('did:key:') ? didKey : `did:key:${didKey}`
  const multibase = did.slice('did:key:'.length)
  if (!multibase.startsWith('z')) {
    throw new Error('UnsupportedDidKeyEncoding')
  }

  const raw = base58Decode(multibase.slice(1))
  if (
    raw.length < ED25519_MULTICODEC_PREFIX.length + 32 ||
    !raw.subarray(0, ED25519_MULTICODEC_PREFIX.length).equals(ED25519_MULTICODEC_PREFIX)
  ) {
    throw new Error('UnsupportedDidKeyType')
  }

  const publicKey = raw.subarray(ED25519_MULTICODEC_PREFIX.length, ED25519_MULTICODEC_PREFIX.length + 32)
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: publicKey.toString('base64url'),
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function normalizeIssuerUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`FetchFailed:${response.status}:${url}`)
  }
  const parsed = (await response.json()) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`InvalidJson:${url}`)
  }
  return parsed as Record<string, unknown>
}

async function discoverJwksUrls(issuerUrl: string): Promise<string[]> {
  const base = normalizeIssuerUrl(issuerUrl)
  const candidates = new Set<string>([
    `${base}/jwks`,
    `${base}/.well-known/jwks.json`,
    `${base}/oauth/jwks`,
  ])

  const metadataUrls = [
    `${base}/.well-known/openid-credential-issuer`,
    `${base}/.well-known/oauth-authorization-server`,
  ]

  for (const metadataUrl of metadataUrls) {
    try {
      const metadata = await fetchJson(metadataUrl)
      const jwksUri = readString(metadata.jwks_uri)
      if (jwksUri) candidates.add(jwksUri)
    } catch {
      // try next metadata endpoint
    }
  }

  return [...candidates]
}

function isEd25519JwkEntry(entry: unknown): entry is Record<string, unknown> & { kty: 'OKP'; crv: 'Ed25519'; x: string } {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false
  const record = entry as Record<string, unknown>
  return record.kty === 'OKP' && record.crv === 'Ed25519' && typeof record.x === 'string'
}

function pickEd25519Key(keys: unknown[], kid?: string): Ed25519PublicJwk | undefined {
  const ed25519Keys = keys.filter(isEd25519JwkEntry)

  if (kid) {
    const exact = ed25519Keys.find((key) => readString(key.kid) === kid)
    if (exact) {
      return { kty: 'OKP', crv: 'Ed25519', x: readString(exact.x)! }
    }
  }

  if (ed25519Keys.length === 1) {
    const only = ed25519Keys[0]!
    return { kty: 'OKP', crv: 'Ed25519', x: readString(only.x)! }
  }

  return undefined
}

async function resolveFromIssuerJwks(rawVc: string, issuerUrl: string): Promise<Ed25519PublicJwk> {
  const { header } = readIssuerJwtParts(rawVc)
  const kid = readString(header.kid)
  const urls = await discoverJwksUrls(issuerUrl)

  for (const url of urls) {
    try {
      const document = await fetchJson(url)
      const keys = Array.isArray(document.keys) ? document.keys : []
      const match = pickEd25519Key(keys, kid)
      if (match) return match
    } catch {
      // try next JWKS URL
    }
  }

  throw new Error('IssuerKeyNotFound: could not match issuer kid in JWKS')
}

export async function resolveVpIssuerPublicKeyFromRawVc(
  rawVc: string,
  issuerUrl?: string,
): Promise<Ed25519PublicJwk> {
  const { header, payload } = readIssuerJwtParts(rawVc)
  const alg = readString(header.alg)
  if (alg !== 'EdDSA') {
    throw new Error(`IssuerAlgUnsupported:${alg ?? 'missing'}`)
  }

  const kid = readString(header.kid)
  if (kid?.startsWith('did:key:')) {
    const did = kid.split('#')[0]!
    return didKeyToEd25519PublicJwk(did)
  }

  const issuer =
    issuerUrl ??
    readString(payload.iss) ??
    process.env.ISSUER_PROXY_TARGET ??
    'http://192.100.10.46'

  return resolveFromIssuerJwks(rawVc, issuer)
}

export function formatVpIssuerPublicKeyEnvLine(jwk: Ed25519PublicJwk): string {
  return `VP_ISSUER_PUBLIC_KEY_JWK=${JSON.stringify(jwk)}`
}
