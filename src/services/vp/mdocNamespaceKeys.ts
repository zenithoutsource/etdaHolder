import type { DcqlCredentialQuery } from '../presentationService'
import type { ResolvedPresentationRequest } from '../presentationService'

/**
 * Normalize ISO mdoc field keys to `namespace/identifier` for native DeviceResponse builders.
 * Accepts DCQL two-segment paths, slash keys, and dotted keys (`org.iso.18013.5.1.given_name`).
 */
export function normalizeMdocNamespaceKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) return trimmed
  if (trimmed.includes('/')) return trimmed

  const pathSegments = trimmed.split('.')
  if (pathSegments.length >= 2) {
    return `${pathSegments.slice(0, -1).join('.')}/${pathSegments[pathSegments.length - 1]}`
  }

  return trimmed
}

export function readRequestedMdocNamespaceKeys(credential: DcqlCredentialQuery): string[] {
  const claims = credential.claims ?? []
  if (claims.length === 0) {
    throw new Error('PresentationRequestUnsupported: mso_mdoc claim paths are required')
  }

  const keys = new Set<string>()
  for (const claim of claims) {
    if (claim.path.length < 2) {
      throw new Error('PresentationRequestUnsupported: mso_mdoc claims require namespace and identifier')
    }
    keys.add(normalizeMdocNamespaceKey(claim.path.join('.')))
  }
  return [...keys]
}

export function readApprovedMdocNamespaceKeysForPresentation(
  request: ResolvedPresentationRequest,
  selectedClaimKeys?: readonly string[],
): string[] {
  const credentialQuery = request.dcqlQuery?.credentials[0]
  if (!credentialQuery || credentialQuery.format !== 'mso_mdoc') {
    throw new Error('PresentationRequestUnsupported: mso_mdoc credential query is required')
  }

  const requested = readRequestedMdocNamespaceKeys(credentialQuery)
  if (!selectedClaimKeys || selectedClaimKeys.length === 0) {
    return requested
  }

  const selected = new Set(selectedClaimKeys.map(normalizeMdocNamespaceKey))
  const approved = requested.filter((key) => selected.has(key))
  if (approved.length === 0) {
    throw new Error('PresentationRequestInvalid: no approved mdoc fields match the DCQL request')
  }
  return approved
}
