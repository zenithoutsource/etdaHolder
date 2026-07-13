import { resolveVerifierPresentationBaseUrl } from './verifierPresentationBaseUrl'

/** @deprecated Use resolveVerifierPresentationBaseUrl — kept for backward compatibility. */
export function resolvePresentationGatewayBaseUrl(): string {
  return resolveVerifierPresentationBaseUrl()
}

export { resolveVerifierPresentationBaseUrl }
