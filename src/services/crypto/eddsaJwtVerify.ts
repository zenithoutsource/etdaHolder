import { hashes, verify } from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha2.js'

import { base64UrlToBytes, readString } from '@/src/utils/jwtUtils'

if (!hashes.sha512) hashes.sha512 = sha512

/** Verify a compact JWT signed with EdDSA (OKP / Ed25519 JWK `x`). */
export function verifyEdDsaCompactJwt(
  jwt: string,
  publicJwk: Record<string, unknown>,
): boolean {
  if (publicJwk.kty !== 'OKP' || publicJwk.crv !== 'Ed25519') return false

  const x = readString(publicJwk.x)
  if (!x) return false

  const parts = jwt.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false

  try {
    return verify(
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
      base64UrlToBytes(x),
    )
  } catch {
    return false
  }
}
