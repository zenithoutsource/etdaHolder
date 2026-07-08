export type CompanionSharingMode = 'mdoc-only' | 'dual-format'

export type CompanionCapabilities = {
  version: number
  supportedModes: CompanionSharingMode[]
  activeProfileId: string
  maxCompanionBytes: number
}

export type CompanionBeginRequest = {
  mode: CompanionSharingMode
  nonce: Uint8Array
  profileId: string
}

export type CompanionPresentationInput = {
  sdJwt: string
  nonceBytes: Uint8Array
}

/**
 * Proprietary NFC companion transport (second AID leg after mDOC session).
 * Each vendor/protocol ships as a registered plugin; ETDA v1 is the reference plugin.
 */
export type CompanionTransportPlugin = {
  id: string
  vendorId: string
  displayName: string
  aids: readonly string[]
  nonceBytes: number
  encodeCapabilities: (input: CompanionCapabilities) => Uint8Array
  decodeBeginRequest: (bytes: Uint8Array) => CompanionBeginRequest
  buildPresentation: (input: CompanionPresentationInput) => Promise<string>
}
