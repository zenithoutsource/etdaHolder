import { readSameDeviceCredentialIssuer } from '@/src/config/sameDeviceIssuance'
import { base64UrlDecodeToString } from '../../utils/jwtUtils'
import { resolveDidKeyViaIssuer, type Ed25519PublicJwk } from './resolveDidKeyViaIssuer'

function decodeBase64UrlJson(part: string): Record<string, unknown> {
  const parsed = JSON.parse(base64UrlDecodeToString(part)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('InvalidJwtJson')
  }
  return parsed as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export type { Ed25519PublicJwk }

export async function resolveIssuerPublicJwkFromRawVc(
  rawVc: string,
  options: { issuerUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<Ed25519PublicJwk> {
  const trimmed = rawVc.trim()
  const issuerJwt = trimmed.includes('~') ? trimmed.split('~')[0]! : trimmed
  const [headerPart, payloadPart] = issuerJwt.split('.')
  if (!headerPart || !payloadPart) {
    throw new Error('InvalidRawVc')
  }

  const header = decodeBase64UrlJson(headerPart)
  const payload = decodeBase64UrlJson(payloadPart)
  const alg = readString(header.alg)
  if (alg !== 'EdDSA') {
    throw new Error(`IssuerAlgUnsupported:${alg ?? 'missing'}`)
  }

  const kid = readString(header.kid)
  if (!kid?.startsWith('did:key:')) {
    throw new Error('IssuerKidNotDidKey')
  }

  const issuer =
    options.issuerUrl ??
    readString(payload.iss) ??
    readSameDeviceCredentialIssuer()

  return resolveDidKeyViaIssuer(issuer, kid, options.fetchImpl)
}

export function formatVpIssuerPublicKeyEnvLine(jwk: Ed25519PublicJwk): string {
  return `VP_ISSUER_PUBLIC_KEY_JWK=${JSON.stringify(jwk)}`
}
