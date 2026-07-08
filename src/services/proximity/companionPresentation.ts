import { getCompanionTransportPlugin } from './companionTransport/registry'
import type { CompanionPresentationInput } from './companionTransport/types'

export async function buildCompanionPresentation(
  transportPluginId: string,
  input: CompanionPresentationInput,
): Promise<string> {
  return getCompanionTransportPlugin(transportPluginId).buildPresentation(input)
}

export { getCompanionTransportPlugin } from './companionTransport/registry'
