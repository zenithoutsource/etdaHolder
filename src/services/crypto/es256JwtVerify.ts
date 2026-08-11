import { base64UrlToBytes, readString } from '@/src/utils/jwtUtils'

import type { EcP256Jwk } from './hardwareEcdsaTypes'
import { p256JwkToPublicKey, verifyEs256Prehash } from './p256Identity'

/** Verify a compact JWT signed with ES256 (EC / P-256 JWK `x`/`y`). */
export function verifyEs256CompactJwt(
  jwt: string,
  publicJwk: Record<string, unknown>,
): boolean {
  if (publicJwk.kty !== 'EC' || publicJwk.crv !== 'P-256') return false

  const x = readString(publicJwk.x)
  const y = readString(publicJwk.y)
  if (!x || !y) return false

  const parts = jwt.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false

  try {
    const jwk: EcP256Jwk = { kty: 'EC', crv: 'P-256', x, y }
    const publicKey = p256JwkToPublicKey(jwk)
    return verifyEs256Prehash(
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      base64UrlToBytes(parts[2]),
      publicKey,
    )
  } catch {
    return false
  }
}
