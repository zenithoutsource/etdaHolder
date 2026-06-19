import type { TrustedVerifier } from '../services/vp/presentationService'

type Env = Record<string, string | undefined>

export function buildTrustedVerifiersFromEnv(env: Env = process.env): TrustedVerifier[] {
  const verifierApiBaseUrl = normalizeBaseUrl(env.EXPO_PUBLIC_VERIFIER_API_BASE_URL)
  if (!verifierApiBaseUrl) return []

  return [
    {
      clientId: `redirect_uri:${verifierApiBaseUrl}/openid4vc/verify`,
      name: env.EXPO_PUBLIC_VERIFIER_NAME?.trim() || 'Verifier API',
      allowedOrigins: [new URL(verifierApiBaseUrl).origin],
    },
  ]
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
