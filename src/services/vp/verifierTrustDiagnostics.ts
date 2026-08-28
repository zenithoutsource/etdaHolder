import { parseClientId, readResponseUriMatchesClientId } from './clientIdScheme'
import { isClientIdSchemeSupportedForTrust } from './clientIdInteropPolicy'
import {
  readTrustAnyOid4vcIssuerEnabled,
  readTrustAnyOid4vcVerifierEnabled,
} from '@/src/config/oid4vcPeerTrustPolicy'

export type VerifierTrustRejectionReason =
  | 'invalid-response-uri'
  | 'unsupported-client-id-scheme'
  | 'client-id-response-uri-mismatch'
  | 'interop-disabled'
  | 'non-https-origin'

export function describeVerifierTrustRejection(
  clientId: string,
  responseUri: string,
  trustAnyHttpsPeer: boolean,
): VerifierTrustRejectionReason {
  try {
    new URL(responseUri)
  } catch {
    return 'invalid-response-uri'
  }

  const parsedClientId = parseClientId(clientId)
  if (!isClientIdSchemeSupportedForTrust(parsedClientId.scheme, trustAnyHttpsPeer)) {
    return parsedClientId.scheme === 'unknown' ||
      parsedClientId.scheme === 'openid_federation' ||
      parsedClientId.scheme === 'verifier_attestation' ||
      parsedClientId.scheme === 'origin' ||
      parsedClientId.scheme === 'x509_hash' ||
      parsedClientId.scheme === 'x509_san_dns'
      ? 'unsupported-client-id-scheme'
      : 'interop-disabled'
  }

  if (
    !readResponseUriMatchesClientId(clientId, responseUri, { allowSameOrigin: trustAnyHttpsPeer })
  ) {
    return 'client-id-response-uri-mismatch'
  }

  if (!trustAnyHttpsPeer) return 'interop-disabled'

  try {
    if (new URL(responseUri).protocol !== 'https:') return 'non-https-origin'
  } catch {
    return 'invalid-response-uri'
  }

  return 'interop-disabled'
}

export function readVerifierTrustInteropFlags(): {
  issuerInterop: boolean
  verifierInterop: boolean
} {
  return {
    issuerInterop: readTrustAnyOid4vcIssuerEnabled(),
    verifierInterop: readTrustAnyOid4vcVerifierEnabled(),
  }
}
