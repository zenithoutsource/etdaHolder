import type { TrustedVerifier } from '../services/vp/presentationService'
import { parseClientId } from '../services/vp/clientIdScheme'

type Env = Record<string, string | undefined>

function readVerificationJwk(env: Env): Record<string, unknown> | undefined {
  const raw = env.EXPO_PUBLIC_VERIFIER_DID_WEB_JWK?.trim()
  if (!raw) return undefined

  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

export function buildTrustedVerifiersFromEnv(env: Env = process.env): TrustedVerifier[] {
  const verifiers: TrustedVerifier[] = []
  const verifierApiBaseUrl = normalizeBaseUrl(env.EXPO_PUBLIC_VERIFIER_API_BASE_URL)
  if (verifierApiBaseUrl) {
    verifiers.push({
      clientId: `redirect_uri:${verifierApiBaseUrl}/openid4vc/verify`,
      name: env.EXPO_PUBLIC_VERIFIER_NAME?.trim() || 'Verifier API',
      allowedOrigins: [new URL(verifierApiBaseUrl).origin],
    })
  }

  const didWebClientId = env.EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID?.trim()
  const didWebResponseOrigin = readOrigin(env.EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN)
  if (didWebClientId && didWebResponseOrigin) {
    const parsed = parseClientId(didWebClientId)
    const normalizedClientId =
      parsed.scheme === 'decentralized_identifier'
        ? didWebClientId
        : `decentralized_identifier:${didWebClientId}`

    verifiers.push({
      clientId: normalizedClientId,
      name: env.EXPO_PUBLIC_VERIFIER_DID_WEB_NAME?.trim() || env.EXPO_PUBLIC_VERIFIER_NAME?.trim() || 'Trusted Verifier',
      allowedOrigins: [didWebResponseOrigin],
      verificationJwk: readVerificationJwk(env),
    })
  }

  return verifiers
}

export const TRUSTED_VERIFIERS: TrustedVerifier[] = buildTrustedVerifiersFromEnv()

function normalizeBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, '')
  if (!trimmed) return undefined

  try {
    return new URL(trimmed).toString().replace(/\/+$/, '')
  } catch {
    return undefined
  }
}

function readOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  try {
    return new URL(trimmed).origin
  } catch {
    return undefined
  }
}
