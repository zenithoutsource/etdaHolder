/**
 * Companion transport v1 — reference plugin constants.
 * Spec: docs/superpowers/specs/nfc-companion-apdu.md
 */

export const COMPANION_PLUGIN_ID = 'etda-companion-v1'

export const COMPANION_AID_HEX = 'A00000045444410100'

export const ISO_MDOC_AID_HEX = 'A0000002480400'

export const COMPANION_PROTOCOL_VERSION = 1

export const COMPANION_AUD = 'urn:etda:companion:nfc:v1'

export const COMPANION_NONCE_BYTES = 32

export const COMPANION_CLA = 0x80

export const COMPANION_INS = {
  GET_CAPABILITIES: 0xca,
  BEGIN_COMPANION: 0xcb,
  GET_RESPONSE: 0xc0,
  ABORT: 0xff,
} as const

export const COMPANION_MODES = ['mdoc-only', 'dual-format'] as const

export type CompanionMode = (typeof COMPANION_MODES)[number]

export const COMPANION_CBOR_KEY = {
  version: 1,
  supportedModes: 2,
  activeProfileId: 3,
  maxCompanionBytes: 4,
  mode: 1,
  nonce: 2,
  profileId: 3,
} as const

export const COMPANION_SW = {
  SUCCESS: 0x9000,
  CONDITIONS_NOT_SATISFIED: 0x6985,
  SECURITY_NOT_SATISFIED: 0x6982,
  FILE_NOT_FOUND: 0x6a82,
  INS_NOT_SUPPORTED: 0x6d00,
  UNKNOWN: 0x6f00,
} as const

export function isCompanionMode(value: string): value is CompanionMode {
  return (COMPANION_MODES as readonly string[]).includes(value)
}

export const COMPANION_CAPABILITIES_V1_DEFAULTS = {
  version: COMPANION_PROTOCOL_VERSION,
  supportedModes: [...COMPANION_MODES] as CompanionMode[],
  activeProfileId: 'etda-transcript-acr1311u-n2',
  maxCompanionBytes: 65_536,
}
