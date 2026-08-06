import type { TrustedVerifier } from '../services/vp/presentationService'
import { parseClientId } from '../services/vp/clientIdScheme'

type Env = Record<string, string | undefined>

// Expo only inlines EXPO_PUBLIC_* values that use direct process.env dot access.
// Keep this snapshot explicit so release bundles receive the configured trust policy.
const BUILD_ENV: Env = {
  EXPO_PUBLIC_VERIFIER_API_BASE_URL: process.env.EXPO_PUBLIC_VERIFIER_API_BASE_URL,
  EXPO_PUBLIC_VERIFIER_NAME: process.env.EXPO_PUBLIC_VERIFIER_NAME,
  EXPO_PUBLIC_ALLOW_REDIRECT_URI_VERIFIER_TRUST:
    process.env.EXPO_PUBLIC_ALLOW_REDIRECT_URI_VERIFIER_TRUST,
  EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID,
  EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN:
    process.env.EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN,
  EXPO_PUBLIC_VERIFIER_DID_WEB_NAME: process.env.EXPO_PUBLIC_VERIFIER_DID_WEB_NAME,
  EXPO_PUBLIC_VERIFIER_DID_WEB_JWK: process.env.EXPO_PUBLIC_VERIFIER_DID_WEB_JWK,
  EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID:
    process.env.EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID,
  EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN:
    process.env.EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN,
  EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_NAME:
    process.env.EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_NAME,
  EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_JWK:
    process.env.EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_JWK,
  EXPO_PUBLIC_WALLET_API_BASE_URL: process.env.EXPO_PUBLIC_WALLET_API_BASE_URL,
}

function readVerificationJwk(env: Env, key: string): Record<string, unknown> | undefined {
  const raw = env[key]?.trim()
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

function buildDidWebTrustedPartyFromEnv(input: {
  env: Env
  clientIdKey: string
  responseOriginKey: string
  nameKey: string
  fallbackName?: string
  jwkKey: string
}): TrustedVerifier | undefined {
  const didWebClientId = input.env[input.clientIdKey]?.trim()
  const didWebResponseOrigin = readOrigin(input.env[input.responseOriginKey])
  if (!didWebClientId || !didWebResponseOrigin) return undefined

  const parsed = parseClientId(didWebClientId)
  const normalizedClientId =
    parsed.scheme === 'decentralized_identifier'
      ? didWebClientId
      : `decentralized_identifier:${didWebClientId}`

  const verificationJwk = readVerificationJwk(input.env, input.jwkKey)

  return {
    clientId: normalizedClientId,
    name: input.env[input.nameKey]?.trim() || input.fallbackName || 'Trusted Party',
    allowedOrigins: [didWebResponseOrigin],
    ...(verificationJwk ? { verificationJwk } : {}),
  }
}

function shouldEmitRedirectUriVerifierTrust(env: Env, isDevelopment: boolean): boolean {
  const verifierApiBaseUrl = normalizeBaseUrl(env.EXPO_PUBLIC_VERIFIER_API_BASE_URL)
  if (!verifierApiBaseUrl) return false
  if (isDevelopment) return true
  if (env.EXPO_PUBLIC_ALLOW_REDIRECT_URI_VERIFIER_TRUST !== 'true') return false

  try {
    return new URL(verifierApiBaseUrl).protocol === 'https:'
  } catch {
    return false
  }
}

export function buildTrustedVerifiersFromEnv(
  env: Env = BUILD_ENV,
  isDevelopment = __DEV__,
): TrustedVerifier[] {
  const verifiers: TrustedVerifier[] = []
  const verifierApiBaseUrl = normalizeBaseUrl(env.EXPO_PUBLIC_VERIFIER_API_BASE_URL)
  if (shouldEmitRedirectUriVerifierTrust(env, isDevelopment) && verifierApiBaseUrl) {
    verifiers.push({
      clientId: `redirect_uri:${verifierApiBaseUrl}/openid4vc/verify`,
      name: env.EXPO_PUBLIC_VERIFIER_NAME?.trim() || 'Verifier API',
      allowedOrigins: [new URL(verifierApiBaseUrl).origin],
    })
  }

  const verifierDidWeb = buildDidWebTrustedPartyFromEnv({
    env,
    clientIdKey: 'EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID',
    responseOriginKey: 'EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN',
    nameKey: 'EXPO_PUBLIC_VERIFIER_DID_WEB_NAME',
    fallbackName: env.EXPO_PUBLIC_VERIFIER_NAME?.trim() || 'Trusted Verifier',
    jwkKey: 'EXPO_PUBLIC_VERIFIER_DID_WEB_JWK',
  })
  if (verifierDidWeb) verifiers.push(verifierDidWeb)

  const issuerDidWeb = buildDidWebTrustedPartyFromEnv({
    env,
    clientIdKey: 'EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID',
    responseOriginKey: 'EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN',
    nameKey: 'EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_NAME',
    fallbackName: 'Trusted Issuer',
    jwkKey: 'EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_JWK',
  })
  if (issuerDidWeb) verifiers.push(issuerDidWeb)

  const walletApiBaseUrl = normalizeBaseUrl(env.EXPO_PUBLIC_WALLET_API_BASE_URL)
  if (isDevelopment && walletApiBaseUrl) {
    const renewalResponseUri = `${walletApiBaseUrl}/wallet-api/dev/wallet/renewal-vp/response`
    verifiers.push({
      clientId: `redirect_uri:${renewalResponseUri}`,
      name: 'Dev Renewal Issuer',
      allowedOrigins: [new URL(walletApiBaseUrl).origin],
    })
  }

  return verifiers
}

export function readTrustedVerifierBuildPolicy(
  env: Env = BUILD_ENV,
  isDevelopment = __DEV__,
): { includesRedirectUri: boolean; includesDidWeb: boolean } {
  const verifiers = buildTrustedVerifiersFromEnv(env, isDevelopment)

  return {
    includesRedirectUri: verifiers.some((verifier) => verifier.clientId.startsWith('redirect_uri:')),
    includesDidWeb: verifiers.some((verifier) =>
      verifier.clientId.startsWith('decentralized_identifier:did:web:'),
    ),
  }
}

export function isIssuerOid4VpClientId(clientId: string, env: Env = BUILD_ENV): boolean {
  const issuer = readIssuerOid4VpTrustFromEnv(env)
  if (!issuer) return false
  return clientIdsEquivalent(clientId, issuer.clientId)
}

export function isIssuerOid4VpResponseUri(responseUri: string, env: Env = BUILD_ENV): boolean {
  const issuer = readIssuerOid4VpTrustFromEnv(env)
  if (!issuer) return false

  const origin = readResponseOrigin(responseUri)
  return Boolean(origin && issuer.allowedOrigins.includes(origin))
}

function readIssuerOid4VpTrustFromEnv(env: Env): TrustedVerifier | undefined {
  return buildDidWebTrustedPartyFromEnv({
    env,
    clientIdKey: 'EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_CLIENT_ID',
    responseOriginKey: 'EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_RESPONSE_ORIGIN',
    nameKey: 'EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_NAME',
    fallbackName: 'Trusted Issuer',
    jwkKey: 'EXPO_PUBLIC_ISSUER_OID4VP_DID_WEB_JWK',
  })
}

function clientIdsEquivalent(left: string, right: string): boolean {
  const parsedLeft = parseClientId(left)
  const parsedRight = parseClientId(right)
  return parsedLeft.scheme === parsedRight.scheme && parsedLeft.originalClientId === parsedRight.originalClientId
}

function readResponseOrigin(responseUri: string): string | undefined {
  try {
    return new URL(responseUri).origin
  } catch {
    return undefined
  }
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
