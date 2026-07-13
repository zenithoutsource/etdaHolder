import type { PresentationGatewayClient } from './presentationGatewayClient'
import {
  createVerifierPresentationAdapter,
  getDefaultVerifierPresentationClient,
  setDefaultVerifierPresentationClientForTests,
} from './verifierPresentationAdapter'

export { createVerifierPresentationAdapter }

/** @deprecated Use createVerifierPresentationAdapter — kept for backward compatibility. */
export const createRelayPresentationGatewayAdapter = createVerifierPresentationAdapter

/** @deprecated Use getDefaultVerifierPresentationClient — kept for backward compatibility. */
export function getDefaultPresentationGatewayClient(): PresentationGatewayClient {
  return getDefaultVerifierPresentationClient()
}

/** @deprecated Use setDefaultVerifierPresentationClientForTests — kept for backward compatibility. */
export function setDefaultPresentationGatewayClientForTests(client: PresentationGatewayClient | undefined): void {
  setDefaultVerifierPresentationClientForTests(client)
}
