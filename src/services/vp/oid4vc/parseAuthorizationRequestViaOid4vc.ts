import {
  parseOpenid4vpAuthorizationRequest,
  resolveOpenid4vpAuthorizationRequest,
} from '@openid4vc/openid4vp'
import type { CallbackContext, JwtSignerJwk } from '@openid4vc/oauth2'

import {
  decodeJsonBase64Url,
  isRecord,
  looksLikeCompactJwt,
  readString,
  toErrorMessage,
} from '@/src/utils/jwtUtils'
import { logWalletError } from '@/src/services/debug/walletLogger'
import { isTrustedIssuerJwtAlg } from '@/src/config/issuerJwtVerifyPolicy'
import {
  resolveRequestObjectVerificationJwk,
  verifyAuthorizationRequestSignature,
} from '../authorizationRequestJar'
import { parseClientId } from '../clientIdScheme'
import { findTrustedVerifier, type TrustedVerifier } from '../trustedVerifierMatcher'
import { createOid4vcCallbacks } from './oid4vcCallbacks'
import type { AuthorizationRequestMaterial, Oid4vcAdapterContext } from './types'

function createAdapterVerifyJwtImpl(input: {
  trustedVerifiers: TrustedVerifier[]
  fetchImpl?: typeof fetch
}): CallbackContext['verifyJwt'] {
  return async (jwtSigner, jwt) => {
    try {
      const header = jwt.header
      const payload = jwt.payload
      if (!isRecord(header) || !isRecord(payload)) {
        return { verified: false as const }
      }

      const alg = readString(jwtSigner.alg) ?? readString(header.alg)
      if (!alg || alg === 'none' || !isTrustedIssuerJwtAlg(alg)) {
        logWalletError('oid4vp', 'jar_verify_rejected_alg', new Error(`unsupported alg: ${alg ?? 'missing'}`))
        return { verified: false as const }
      }

      let verificationJwk: JwtSignerJwk['publicJwk'] | undefined

      const clientId = readString(payload.client_id)
      if (!clientId) {
        return { verified: false as const }
      }

      try {
        verificationJwk = (await resolveRequestObjectVerificationJwk({
          clientId,
          responseUri: readString(payload.response_uri),
          header,
          trustedVerifiers: input.trustedVerifiers,
          fetchImpl: input.fetchImpl ?? fetch,
        })) as JwtSignerJwk['publicJwk']
      } catch (error) {
        logWalletError('oid4vp', 'jar_verify_key_resolve_failed', error, {
          signerMethod: jwtSigner.method,
          clientId,
        })
        return { verified: false as const }
      }

      if (jwtSigner.method !== 'jwk' && jwtSigner.method !== 'did') {
        logWalletError(
          'oid4vp',
          'jar_verify_rejected_signer_method',
          new Error(`unsupported signer method: ${jwtSigner.method}`),
        )
        return { verified: false as const }
      }

      if (!verificationJwk || !verifyAuthorizationRequestSignature(jwt.compact, verificationJwk, alg)) {
        logWalletError('oid4vp', 'jar_verify_signature_failed', new Error('signature mismatch or key resolve failed'), {
          alg,
          signerMethod: jwtSigner.method,
          clientId: readString(payload.client_id),
        })
        return { verified: false as const }
      }

      return { verified: true as const, signerJwk: verificationJwk }
    } catch (error) {
      logWalletError('oid4vp', 'jar_verify_exception', error)
      return { verified: false as const }
    }
  }
}

/**
 * OID4VP 1.0 forbids signed request objects for `redirect_uri` client ids, and
 * `@openid4vc/openid4vp` rejects JAR verification for that prefix. Trusted
 * Verifiers may still ship ES256/EdDSA JARs with `kid` only — verify via JWKS
 * (or header/pinned JWK), then pass the payload so the adapter never sees JAR.
 *
 * DID clients must use OID4VP 1.0 `decentralized_identifier:did:…` (signed JAR).
 * Bare `did:` is rejected — it is a pre-1.0 draft form and conflicts with
 * `vp_formats_supported` in @openid4vc version inference.
 */
async function verifyAndUnwrapRedirectUriJar(input: {
  rawBody: string
  header: Record<string, unknown>
  payload: Record<string, unknown>
  clientId: string
  trustedVerifiers: TrustedVerifier[]
  fetchImpl: typeof fetch
  alg: string
}): Promise<Record<string, unknown>> {
  const verificationJwk = await resolveRequestObjectVerificationJwk({
    clientId: input.clientId,
    responseUri: readString(input.payload.response_uri),
    header: input.header,
    trustedVerifiers: input.trustedVerifiers,
    fetchImpl: input.fetchImpl,
  })
  if (!verifyAuthorizationRequestSignature(input.rawBody, verificationJwk, input.alg)) {
    throw new Error('PresentationRequestInvalid: request object signature verification failed')
  }
  return input.payload
}

function rejectBareDidClientId(clientId: string | undefined): void {
  if (!clientId?.startsWith('did:')) return
  throw new Error(
    'PresentationRequestInvalid: OID4VP 1.0 requires client_id "decentralized_identifier:did:…"; bare did: is not supported',
  )
}

async function buildAuthorizationRequestInput(
  material: AuthorizationRequestMaterial,
  options: {
    trustedVerifiers: TrustedVerifier[]
    fetchImpl: typeof fetch
  },
): Promise<string | Record<string, unknown>> {
  const rawBody = material.rawBody?.trim()
  if (rawBody) {
    if (looksLikeCompactJwt(rawBody)) {
      const parts = rawBody.split('.')
      const headerSegment = parts[0]
      const payloadSegment = parts[1]
      const signatureSegment = parts[2]

      if (headerSegment && payloadSegment) {
        const header = decodeJsonBase64Url<Record<string, unknown>>(headerSegment)
        const payload = decodeJsonBase64Url<Record<string, unknown>>(payloadSegment)
        const alg = readString(header?.alg)
        if (!signatureSegment || !alg || alg === 'none') {
          if (isRecord(payload)) {
            rejectBareDidClientId(readString(payload.client_id))
            return payload
          }
        } else if (isRecord(header) && isRecord(payload)) {
          const clientId = readString(payload.client_id)
          rejectBareDidClientId(clientId)
          const scheme = clientId ? parseClientId(clientId).scheme : undefined

          // Signed redirect_uri JARs are illegal in OID4VP 1.0 / @openid4vc —
          // verify locally then unwrap.
          if (clientId && scheme === 'redirect_uri') {
            return verifyAndUnwrapRedirectUriJar({
              rawBody,
              header,
              payload,
              clientId,
              trustedVerifiers: options.trustedVerifiers,
              fetchImpl: options.fetchImpl,
              alg,
            })
          }

          const jarParams: Record<string, unknown> = { request: rawBody }
          if (clientId) jarParams.client_id = clientId
          return jarParams
        }
      }
    }

    return rawBody
  }

  if (material.byValueParams) {
    rejectBareDidClientId(readString(material.byValueParams.client_id))
    return material.byValueParams
  }

  throw new Error('PresentationRequestInvalid: authorization request material is empty')
}

function extractTrustFields(material: AuthorizationRequestMaterial): {
  clientId?: string
  responseUri?: string
} {
  const rawBody = material.rawBody?.trim()
  if (rawBody) {
    if (looksLikeCompactJwt(rawBody)) {
      const parts = rawBody.split('.')
      const payloadSegment = parts[1]
      if (payloadSegment) {
        const payload = decodeJsonBase64Url<Record<string, unknown>>(payloadSegment)
        if (isRecord(payload)) {
          return {
            clientId: readString(payload.client_id),
            responseUri: readString(payload.response_uri),
          }
        }
      }
    }

    try {
      const parsed = JSON.parse(rawBody) as unknown
      if (isRecord(parsed)) {
        return {
          clientId: readString(parsed.client_id),
          responseUri: readString(parsed.response_uri),
        }
      }
    } catch {
      // fall through to by-value params
    }
  }

  if (material.byValueParams) {
    return {
      clientId: material.byValueParams.client_id,
      responseUri: material.byValueParams.response_uri,
    }
  }

  return {}
}

function mapOid4vcError(error: unknown): Error {
  const message = toErrorMessage(error)
  if (message.includes('PresentationRequest')) return new Error(message)
  return new Error(`PresentationRequestInvalid: ${message}`)
}

export async function parseAuthorizationRequestViaOid4vc(
  material: AuthorizationRequestMaterial,
  options: {
    trustedVerifiers: TrustedVerifier[]
    fetchImpl?: typeof fetch
  },
): Promise<{
  authorizationRequest: Record<string, unknown>
  oid4vcContext: Oid4vcAdapterContext
}> {
  const { clientId, responseUri } = extractTrustFields(material)
  if (!clientId || !responseUri) {
    throw new Error('PresentationRequestInvalid: client_id and response_uri are required')
  }

  rejectBareDidClientId(clientId)

  const trustedVerifier = findTrustedVerifier(clientId, responseUri, options.trustedVerifiers)
  if (!trustedVerifier) {
    throw new Error('PresentationRequestInvalid: verifier is not trusted')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const callbacks = createOid4vcCallbacks({
    fetchImpl,
    verifyJwtImpl: createAdapterVerifyJwtImpl({
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl,
    }),
  })

  try {
    const authorizationRequestInput = await buildAuthorizationRequestInput(material, {
      trustedVerifiers: options.trustedVerifiers,
      fetchImpl,
    })
    const parsed = parseOpenid4vpAuthorizationRequest({ authorizationRequest: authorizationRequestInput })

    const responseModeRaw = readString(parsed.params.response_mode)
    const responseModeType =
      responseModeRaw === 'direct_post.jwt' ? 'direct_post.jwt' : 'direct_post'

    const resolved = await resolveOpenid4vpAuthorizationRequest({
      authorizationRequestPayload: parsed.params as Record<string, unknown>,
      responseMode: { type: responseModeType },
      callbacks,
    })

    const authorizationRequestPayload = resolved.authorizationRequestPayload as Record<string, unknown>

    return {
      authorizationRequest: authorizationRequestPayload,
      oid4vcContext: { authorizationRequestPayload },
    }
  } catch (error) {
    throw mapOid4vcError(error)
  }
}
