import { parseClientId, readResponseUriMatchesClientId } from './clientIdScheme'

export type TrustedVerifier = {
  clientId: string
  name: string
  allowedOrigins: string[]
  verificationJwk?: Record<string, unknown>
}

export function findTrustedVerifier(
  clientId: string,
  responseUri: string,
  trustedVerifiers: TrustedVerifier[],
): TrustedVerifier | undefined {
  const responseOrigin = readUrlOrigin(responseUri)
  if (!responseOrigin) return undefined

  const parsedClientId = parseClientId(clientId)
  if (
    parsedClientId.scheme === 'unknown' ||
    parsedClientId.scheme === 'openid_federation' ||
    parsedClientId.scheme === 'verifier_attestation' ||
    parsedClientId.scheme === 'x509_san_dns' ||
    parsedClientId.scheme === 'x509_hash' ||
    parsedClientId.scheme === 'origin'
  ) {
    return undefined
  }

  if (!readResponseUriMatchesClientId(clientId, responseUri)) {
    return undefined
  }

  return trustedVerifiers.find((verifier) => {
    if (!verifier.allowedOrigins.includes(responseOrigin)) return false

    const verifierClientId = parseClientId(verifier.clientId)
    if (parsedClientId.scheme !== verifierClientId.scheme) return false

    if (parsedClientId.scheme === 'redirect_uri') {
      return (
        verifier.clientId === clientId ||
        clientId.startsWith(`${verifier.clientId}/`)
      )
    }

    if (parsedClientId.scheme === 'decentralized_identifier') {
      return parsedClientId.originalClientId === verifierClientId.originalClientId
    }

    return verifier.clientId === clientId || clientId.startsWith(`${verifier.clientId}/`)
  })
}

function readUrlOrigin(raw: string): string | undefined {
  try {
    return new URL(raw).origin
  } catch {
    return undefined
  }
}
