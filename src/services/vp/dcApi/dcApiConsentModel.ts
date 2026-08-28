/**
 * Maps a resolved DC API presentation into consent-panel view models.
 */
import { resolvePresentationDisclosureLabel } from '@/src/config/cardSchemas'
import { readPresentationVerifierDisplayName } from '@/src/config/presentationVerifierMocks'
import { resolveEffectiveDisclosureKeys } from '@/src/services/vp/claimDisclosurePolicy'
import type {
  PresentationDisclosure,
  ResolvedPresentationRequest,
  TrustedVerifier,
} from '@/src/services/vp/presentationService'
import { readString } from '@/src/utils/jwtUtils'

import { buildDcqlClaimDisclosures } from '../dcqlClaimDisclosures'
import type { DcApiResolvedPresentation } from './dcApiPresentationService'

export function buildDcApiConsentRequest(
  resolved: DcApiResolvedPresentation,
): ResolvedPresentationRequest {
  const verifier = readDcApiVerifier(resolved)
  return {
    requestUri: `dc-api://${resolved.sessionId}`,
    clientId: verifier.clientId,
    responseUri: `origin:${resolved.origin}`,
    responseMode: 'direct_post',
    nonce: resolved.nonce,
    dcqlQuery: resolved.dcqlQuery,
    verifier,
    matchedCredential: resolved.matchedCredential,
    disclosures: buildDcApiDisclosures(resolved),
    protocolPath: 'legacy',
  }
}

export function readApprovedDcApiNamespaceKeys(
  resolved: DcApiResolvedPresentation,
  selectedClaimKeys: ReadonlySet<string>,
): string[] {
  const consentRequest = buildDcApiConsentRequest(resolved)
  const effectiveKeys = resolveEffectiveDisclosureKeys(consentRequest.disclosures, selectedClaimKeys)
  const requested = new Set(resolved.requestedNamespaceKeys)
  return effectiveKeys
    .map((key) => normalizeDcApiNamespaceKey(key, resolved))
    .filter((key) => requested.has(key))
}

function readDcApiVerifier(resolved: DcApiResolvedPresentation): TrustedVerifier {
  if (resolved.verifier) return resolved.verifier

  const clientId = readString(resolved.authorizationRequest.client_id) ?? resolved.origin
  return {
    name: readPresentationVerifierDisplayName(clientId) ?? new URL(resolved.origin).hostname,
    clientId,
    allowedOrigins: [resolved.origin],
  }
}

function buildDcApiDisclosures(resolved: DcApiResolvedPresentation): PresentationDisclosure[] {
  const fromDcql = buildDcqlClaimDisclosures(resolved.matchedCredential, resolved.dcqlQuery)
  if (fromDcql && fromDcql.length > 0) {
    return fromDcql
  }

  return resolved.requestedNamespaceKeys.map((disclosureKey) => {
    const identifier = disclosureKey.split('/')[1] ?? disclosureKey
    return {
      key: disclosureKey,
      label: resolvePresentationDisclosureLabel(resolved.matchedCredential.type, identifier),
      value: '',
    }
  })
}

function normalizeDcApiNamespaceKey(key: string, resolved: DcApiResolvedPresentation): string {
  if (key.includes('/')) return key
  const credentialQuery = resolved.dcqlQuery.credentials[0]
  const claim = credentialQuery?.claims?.find((entry) => entry.path[1] === key)
  if (!claim?.path[0]) return key
  return `${claim.path[0]}/${key}`
}
