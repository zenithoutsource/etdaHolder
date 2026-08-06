import {
  clientAuthenticationNone,
  type CallbackContext,
  HashAlgorithm,
} from '@openid4vc/oauth2'
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js'
import { randomBytes } from 'react-native-quick-crypto'

import { verifyEdDsaCompactJwt } from '@/src/services/crypto/eddsaJwtVerify'
import { isRecord } from '@/src/utils/jwtUtils'

export function createOid4vcCallbacks(options?: {
  fetchImpl?: typeof fetch
}): CallbackContext {
  return {
    fetch: options?.fetchImpl,
    hash: async (data, alg) => {
      if (alg === HashAlgorithm.Sha384) return sha384(data)
      if (alg === HashAlgorithm.Sha512) return sha512(data)
      return sha256(data)
    },
    verifyJwt: async (jwtSigner, jwt) => {
      if (jwtSigner.method !== 'jwk') {
        return { verified: false as const }
      }

      const publicJwk = jwtSigner.publicJwk
      if (!isRecord(publicJwk)) {
        return { verified: false as const }
      }

      const verified = verifyEdDsaCompactJwt(jwt.compact, publicJwk)
      return verified
        ? { verified: true as const, signerJwk: publicJwk }
        : { verified: false as const }
    },
    signJwt: async () => {
      throw new Error('PresentationRequestUnsupported: JWT signing is not supported in Phase 1 adapter callbacks')
    },
    decryptJwe: async () => {
      throw new Error('PresentationRequestUnsupported: JWE decryption is not supported in Phase 1')
    },
    encryptJwe: async () => {
      throw new Error('PresentationRequestUnsupported: JWE encryption is not supported in Phase 1')
    },
    getX509CertificateMetadata: () => {
      throw new Error('PresentationRequestUnsupported: X.509 client identifiers are not supported in Phase 1')
    },
    generateRandom: async (byteLength) => new Uint8Array(randomBytes(byteLength)),
    clientAuthentication: clientAuthenticationNone({ clientId: 'wallet-holder' }),
  }
}
