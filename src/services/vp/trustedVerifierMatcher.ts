import { parseClientId, readResponseUriMatchesClientId } from './clientIdScheme'
import { isClientIdSchemeSupportedForTrust } from './clientIdInteropPolicy'
import { readTrustAnyOid4vcVerifierEnabled } from '@/src/config/oid4vcPeerTrustPolicy'

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
  trustAnyHttpsPeer: boolean = readTrustAnyOid4vcVerifierEnabled(),
): TrustedVerifier | undefined {
  const responseOrigin = readUrlOrigin(responseUri)
  if (!responseOrigin) return undefined

  const parsedClientId = parseClientId(clientId)
  if (!isClientIdSchemeSupportedForTrust(parsedClientId.scheme, trustAnyHttpsPeer)) {
    return undefined
  }

  if (!readResponseUriMatchesClientId(clientId, responseUri, { allowSameOrigin: trustAnyHttpsPeer })) {
    return undefined
  }

  const allowlisted = trustedVerifiers.find((verifier) => {
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

  if (allowlisted) return allowlisted
  if (!trustAnyHttpsPeer) return undefined
  return createEphemeralHttpsVerifier(clientId, responseOrigin)
}

function createEphemeralHttpsVerifier(
  clientId: string,
  responseOrigin: string,
): TrustedVerifier | undefined {
  let origin: URL
  try {
    origin = new URL(responseOrigin)
  } catch {
    return undefined
  }
  if (origin.protocol !== 'https:') return undefined

  return {
    clientId,
    name: origin.host,
    allowedOrigins: [responseOrigin],
  }
}

function readUrlOrigin(raw: string): string | undefined {
  try {
    return new URL(raw).origin
  } catch {
    return undefined
  }
}
