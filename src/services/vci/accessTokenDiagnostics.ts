import { decodeJwtPayload, readString } from '@/src/utils/jwtUtils'

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export type AccessTokenDiagnostics = {
  length: number
  looksLikeJwt: boolean
  jwtIss?: string
  jwtAud?: string
  jwtExp?: number
  jwtIat?: number
  secondsUntilExp?: number
  deviceEpochSeconds: number
}

export function readAccessTokenDiagnostics(accessToken: string): AccessTokenDiagnostics {
  const deviceEpochSeconds = Math.floor(Date.now() / 1000)
  const parts = accessToken.split('.')
  const looksLikeJwt = parts.length === 3

  if (!looksLikeJwt) {
    return {
      length: accessToken.length,
      looksLikeJwt: false,
      deviceEpochSeconds,
    }
  }

  const payload = decodeJwtPayload(accessToken)
  const jwtExp = readNumber(payload?.exp)
  const jwtIat = readNumber(payload?.iat)

  return {
    length: accessToken.length,
    looksLikeJwt: true,
    jwtIss: readString(payload?.iss),
    jwtAud: typeof payload?.aud === 'string' ? payload.aud : Array.isArray(payload?.aud) ? payload.aud.join(',') : undefined,
    jwtExp,
    jwtIat,
    ...(jwtExp !== undefined ? { secondsUntilExp: jwtExp - deviceEpochSeconds } : {}),
    deviceEpochSeconds,
  }
}

export function readProofJwtDiagnostics(proofJwt: string): {
  popIss?: string
  popAud?: string
  popNoncePresent: boolean
} {
  const payload = decodeJwtPayload(proofJwt)
  return {
    popIss: readString(payload?.iss),
    popAud: readString(payload?.aud),
    popNoncePresent: Boolean(readString(payload?.nonce)),
  }
}

function normalizeIssuerUrl(value: string): string {
  return value.replace(/\/$/, '')
}

function readAudienceValues(payload: Record<string, unknown> | undefined): string[] {
  if (!payload) return []
  if (typeof payload.aud === 'string') return [payload.aud]
  if (Array.isArray(payload.aud)) {
    return payload.aud.filter((item): item is string => typeof item === 'string')
  }
  return []
}

export function readAccessTokenSafeDiagnostics(
  accessToken: string,
  issuer: string,
  credentialEndpoint?: string,
): {
  tokenLength: number
  compactTokenShape: boolean
  expiresInSeconds?: number
  audienceMatchesIssuer: boolean
  audienceMatchesCredentialEndpoint: boolean
  issuerClaimMatchesIssuer: boolean
  dpopConfirmationPresent: boolean
  confirmationKidPresent: boolean
  confirmationJwkPresent: boolean
} {
  const normalizedIssuer = normalizeIssuerUrl(issuer)
  const normalizedCredentialEndpoint = credentialEndpoint
    ? normalizeIssuerUrl(credentialEndpoint)
    : undefined
  const deviceEpochSeconds = Math.floor(Date.now() / 1000)
  const parts = accessToken.split('.')
  const compactTokenShape = parts.length === 3

  if (!compactTokenShape) {
    return {
      tokenLength: accessToken.length,
      compactTokenShape: false,
      audienceMatchesIssuer: false,
      audienceMatchesCredentialEndpoint: false,
      issuerClaimMatchesIssuer: false,
      dpopConfirmationPresent: false,
      confirmationKidPresent: false,
      confirmationJwkPresent: false,
    }
  }

  const payload = decodeJwtPayload(accessToken)
  const audiences = readAudienceValues(payload).map(normalizeIssuerUrl)
  const expiresAt = readNumber(payload?.exp)
  const cnf = payload?.cnf
  const cnfRecord = typeof cnf === 'object' && cnf !== null && !Array.isArray(cnf)
    ? (cnf as Record<string, unknown>)
    : undefined

  return {
    tokenLength: accessToken.length,
    compactTokenShape: true,
    ...(expiresAt !== undefined ? { expiresInSeconds: expiresAt - deviceEpochSeconds } : {}),
    audienceMatchesIssuer: audiences.includes(normalizedIssuer),
    audienceMatchesCredentialEndpoint: normalizedCredentialEndpoint
      ? audiences.includes(normalizedCredentialEndpoint)
      : false,
    issuerClaimMatchesIssuer: normalizeIssuerUrl(readString(payload?.iss) ?? '') === normalizedIssuer,
    dpopConfirmationPresent: typeof cnfRecord?.jkt === 'string' && cnfRecord.jkt.length > 0,
    confirmationKidPresent: typeof cnfRecord?.kid === 'string' && cnfRecord.kid.length > 0,
    confirmationJwkPresent: typeof cnfRecord?.jwk === 'object' && cnfRecord.jwk !== null,
  }
}

export function readProofBindingDiagnostics(
  proofJwt: string,
  walletHolderDid?: string,
): {
  popNoncePresent: boolean
  popIssuerMatchesWalletHolder: boolean | undefined
  popAudiencePresent: boolean
  walletHolderDidAvailable: boolean
} {
  const payload = decodeJwtPayload(proofJwt)
  const popIss = readString(payload?.iss)
  const walletHolderDidAvailable = Boolean(walletHolderDid)
  return {
    popNoncePresent: Boolean(readString(payload?.nonce)),
    popIssuerMatchesWalletHolder: walletHolderDidAvailable
      ? Boolean(popIss && popIss === walletHolderDid)
      : undefined,
    popAudiencePresent: Boolean(readString(payload?.aud)),
    walletHolderDidAvailable,
  }
}
