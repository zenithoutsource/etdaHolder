import { getCompanionTransportPlugin } from './companionTransport/registry'

/** Conservative KB-JWT + binding overhead beyond the SD-JWT presentation body. */
const KB_JWT_WIRE_OVERHEAD_BYTES = 512

/**
 * Arm-time byte estimate for a companion APDU response (SD-JWT + KB-JWT).
 * Uses the registered companion transport plugin for nonce sizing.
 */
export function estimateCompanionPayloadBytes(
  rawSdJwtVc: string,
  transportPluginId: string,
): number {
  const plugin = getCompanionTransportPlugin(transportPluginId)
  const sdJwtBytes = new TextEncoder().encode(rawSdJwtVc).length
  return sdJwtBytes + KB_JWT_WIRE_OVERHEAD_BYTES + plugin.nonceBytes
}
