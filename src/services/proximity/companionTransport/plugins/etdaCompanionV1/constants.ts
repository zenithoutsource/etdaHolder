/**
 * ETDA companion transport v1 — reference plugin constants.
 * Spec: docs/superpowers/specs/etda-nfc-companion-apdu.md
 */

export const ETDA_COMPANION_PLUGIN_ID = 'etda-companion-v1'

export const ETDA_COMPANION_AID_HEX = 'A0000004544410100'

export const ISO_MDOC_AID_HEX = 'A0000002480400'

export const ETDA_COMPANION_PROTOCOL_VERSION = 1

export const ETDA_COMPANION_AUD = 'urn:etda:companion:nfc:v1'

export const ETDA_COMPANION_NONCE_BYTES = 32

export const ETDA_COMPANION_CLA = 0x80

export const ETDA_COMPANION_INS = {
  GET_CAPABILITIES: 0xca,
  BEGIN_COMPANION: 0xcb,
  GET_RESPONSE: 0xc0,
  ABORT: 0xff,
} as const

export const ETDA_COMPANION_MODES = ['mdoc-only', 'dual-format'] as const

export type EtdaCompanionMode = (typeof ETDA_COMPANION_MODES)[number]

export const ETDA_COMPANION_CBOR_KEY = {
  version: 1,
  supportedModes: 2,
  activeProfileId: 3,
  maxCompanionBytes: 4,
  mode: 1,
  nonce: 2,
  profileId: 3,
} as const

export const ETDA_COMPANION_SW = {
  SUCCESS: 0x9000,
  CONDITIONS_NOT_SATISFIED: 0x6985,
  SECURITY_NOT_SATISFIED: 0x6982,
  FILE_NOT_FOUND: 0x6a82,
  INS_NOT_SUPPORTED: 0x6d00,
  UNKNOWN: 0x6f00,
} as const

export function isEtdaCompanionMode(value: string): value is EtdaCompanionMode {
  return (ETDA_COMPANION_MODES as readonly string[]).includes(value)
}

export const ETDA_COMPANION_CAPABILITIES_V1_DEFAULTS = {
  version: ETDA_COMPANION_PROTOCOL_VERSION,
  supportedModes: [...ETDA_COMPANION_MODES] as EtdaCompanionMode[],
  activeProfileId: 'etda-transcript-acr1311u-n2',
  maxCompanionBytes: 65_536,
}
