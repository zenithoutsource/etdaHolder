import {
  clientAuthenticationNone,
  type CallbackContext,
  HashAlgorithm,
} from '@openid4vc/oauth2'
import { sha256, sha384, sha512 } from '@noble/hashes/sha2.js'
import { randomBytes } from 'react-native-quick-crypto'

import { readX509CertificateMetadata } from '@/src/services/vp/x509Certificate'
import { verifyEdDsaCompactJwt } from '@/src/services/crypto/eddsaJwtVerify'
import { verifyEs256CompactJwt } from '@/src/services/crypto/es256JwtVerify'
import { isRecord, readString } from '@/src/utils/jwtUtils'

export type Oid4vcCallbackMode = 'vp' | 'vci'

export type CreateOid4vcCallbacksOptions = {
  fetchImpl?: typeof fetch
  mode?: Oid4vcCallbackMode
  signJwtImpl?: CallbackContext['signJwt']
  verifyJwtImpl?: CallbackContext['verifyJwt']
  clientAuthentication?: CallbackContext['clientAuthentication']
}

export function createOid4vcCallbacks(options?: CreateOid4vcCallbacksOptions): CallbackContext {
  const mode = options?.mode ?? 'vp'

  return {
    fetch: options?.fetchImpl ?? fetch,
    hash: async (data, alg) => {
      if (alg === HashAlgorithm.Sha384) return sha384(data)
      if (alg === HashAlgorithm.Sha512) return sha512(data)
      return sha256(data)
    },
    verifyJwt: options?.verifyJwtImpl ?? (async (jwtSigner, jwt) => {
      if (jwtSigner.method !== 'jwk') {
        return { verified: false as const }
      }

      const publicJwk = jwtSigner.publicJwk
      if (!isRecord(publicJwk)) {
        return { verified: false as const }
      }

      const alg =
        readString(jwtSigner.alg) ??
        readString(isRecord(jwt.header) ? jwt.header.alg : undefined)
      const verified =
        alg === 'ES256'
          ? verifyEs256CompactJwt(jwt.compact, publicJwk)
          : verifyEdDsaCompactJwt(jwt.compact, publicJwk)
      return verified
        ? { verified: true as const, signerJwk: publicJwk }
        : { verified: false as const }
    }),
    signJwt: async (signer, input) => {
      if (mode === 'vci' && options?.signJwtImpl) {
        return options.signJwtImpl(signer, input)
      }

      throw new Error('PresentationRequestUnsupported: JWT signing is not supported in Phase 1 adapter callbacks')
    },
    decryptJwe: async () => {
      throw new Error('PresentationRequestUnsupported: JWE decryption is not supported in Phase 1')
    },
    encryptJwe: async () => {
      throw new Error('PresentationRequestUnsupported: JWE encryption is not supported in Phase 1')
    },
    getX509CertificateMetadata: (certificate) => readX509CertificateMetadata(certificate),
    generateRandom: async (byteLength) => new Uint8Array(randomBytes(byteLength)),
    clientAuthentication:
      options?.clientAuthentication ?? clientAuthenticationNone({ clientId: 'wallet-holder' }),
  }
}
