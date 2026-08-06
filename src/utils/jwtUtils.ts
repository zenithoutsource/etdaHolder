export function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function base64UrlDecodeToString(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }

  return new TextDecoder().decode(bytes)
}

export function decodeJwtPayload(jwt: string): Record<string, unknown> | undefined {
  const parts = jwt.split('.')
  if (parts.length < 2 || !parts[1]) return undefined

  try {
    const parsed = JSON.parse(base64UrlDecodeToString(parts[1])) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function decodeJwtHeader(jwt: string): Record<string, unknown> | undefined {
  const parts = jwt.split('.')
  if (!parts[0]) return undefined

  try {
    const parsed = JSON.parse(base64UrlDecodeToString(parts[0])) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

export function decodeJsonBase64Url<T = unknown>(segment: string): T | undefined {
  try {
    return JSON.parse(base64UrlDecodeToString(segment)) as T
  } catch {
    return undefined
  }
}

export function looksLikeCompactJwt(value: string): boolean {
  const parts = value.split('.')
  return parts.length === 3 && Boolean(parts[0] && parts[1])
}

export function decodeJwtPayloadStrict(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.')

  if (parts.length < 2 || !parts[1]) {
    throw new Error('CredentialJwtInvalid: JWT payload is required')
  }

  try {
    const payload = base64UrlDecodeToString(parts[1])
    const parsed = JSON.parse(payload) as unknown

    if (!isRecord(parsed)) {
      throw new Error('payload is not an object')
    }

    return parsed
  } catch (error) {
    throw new Error(`CredentialJwtInvalid: ${toErrorMessage(error)}`)
  }
}

export function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isSameJwk(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  return (
    actual.kty === expected.kty &&
    actual.crv === expected.crv &&
    actual.x === expected.x &&
    (expected.y ? actual.y === expected.y : !actual.y)
  )
}

export function isSameKid(actual: string, expected: string): boolean {
  const expectedDid = expected.split('#')[0]
  return actual === expected || actual === expectedDid
}

export function formatWalletHolderBindingHint(
  holderJwk?: Record<string, unknown>,
  holderKid?: string,
): string {
  if (holderKid) return holderKid.split('#')[0] ?? holderKid
  const x = readString(holderJwk?.x)
  const crv = readString(holderJwk?.crv)
  if (x && crv) return `cnf.jwk ${crv} x=${x}`
  return 'wallet signing key'
}

export function formatCredentialCnfHint(
  cnfJwk?: Record<string, unknown>,
  cnfKid?: string,
): string {
  if (cnfKid) return `cnf.kid=${cnfKid}`
  const x = readString(cnfJwk?.x)
  const crv = readString(cnfJwk?.crv)
  if (x && crv) return `cnf.jwk ${crv} x=${x}`
  return 'cnf missing'
}
