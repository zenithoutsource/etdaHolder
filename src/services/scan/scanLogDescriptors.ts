import type { ResolvedCredentialOffer, VerifiableCredentialRecord } from '../vci/exchangeService'
import type { ResolvedPresentationRequest } from '../vp/presentationService'

export function describeUriForLog(uri: string): Record<string, unknown> {
  try {
    const parsed = new URL(uri)
    return {
      scheme: parsed.protocol.replace(':', ''),
      host: parsed.host || undefined,
      path: parsed.pathname || undefined,
      queryKeys: Array.from(parsed.searchParams.keys()),
      uriBytes: uri.length,
    }
  } catch {
    return { scheme: uri.split(':')[0] || 'unknown', uriBytes: uri.length }
  }
}

export function describeOfferForLog(offer: ResolvedCredentialOffer): Record<string, unknown> {
  return {
    issuer: offer.issuer,
    version: offer.version,
    supportedFlows: offer.supportedFlows,
    txCodeRequired: Boolean(offer.txCode),
    credentialConfigurations: offer.credentialConfigurations.map((configuration) => ({
      id: configuration.id,
      requestId: configuration.requestId,
      format: configuration.format,
    })),
  }
}

export function describeCredentialForLog(record: VerifiableCredentialRecord): Record<string, unknown> {
  return {
    id: record.id,
    type: record.type,
    credentialBytes: record.rawVc.length,
    claimKeys: Object.keys(record.claims),
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  }
}

export function describePresentationForLog(request: ResolvedPresentationRequest): Record<string, unknown> {
  return {
    clientId: request.clientId,
    responseUri: request.responseUri,
    verifierName: request.verifier.name,
    matchedCredentialId: request.matchedCredential.id,
    matchedCredentialType: request.matchedCredential.type,
    selectedItemsCount: request.disclosures.length,
    requestKind: request.dcqlQuery ? 'dcql' : 'presentation_definition',
    statePresent: Boolean(request.state),
  }
}
