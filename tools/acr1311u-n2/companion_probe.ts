/**
 * ACR1311U-N2 host probe stub — see README.md and
 * docs/superpowers/specs/etda-nfc-companion-apdu.md §11.
 *
 * Requires ACS SDK + physical reader; not runnable in CI.
 */

import {
  COMPANION_AID_HEX,
  COMPANION_AUD,
  COMPANION_INS,
  COMPANION_NONCE_BYTES,
} from '../../src/services/proximity/companionTransport/plugins/companionV1/constants'

export const COMPANION_PROBE_APDU = {
  selectAid: hexToBytes(COMPANION_AID_HEX),
  getCapabilities: [0x80, COMPANION_INS.GET_CAPABILITIES, 0x00, 0x00, 0x00],
  getResponse: [0x80, COMPANION_INS.GET_RESPONSE, 0x00, 0x00, 0x00],
  abort: [0x80, COMPANION_INS.ABORT, 0x00, 0x00, 0x00],
} as const

export function buildBeginCompanionApdu(mode: string, nonce: Uint8Array, profileId: string): Uint8Array {
  if (nonce.length !== COMPANION_NONCE_BYTES) {
    throw new Error(`nonce must be ${COMPANION_NONCE_BYTES} bytes`)
  }

  const body = encodeBeginCompanionCbor({ mode, nonce, profileId })
  return new Uint8Array([0x80, COMPANION_INS.BEGIN_COMPANION, 0x00, 0x00, body.length, ...body])
}

export function companionAudUrn(): string {
  return COMPANION_AUD
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Minimal CBOR map encoder for BEGIN COMPANION request body (keys 1–3). */
function encodeBeginCompanionCbor(input: {
  mode: string
  nonce: Uint8Array
  profileId: string
}): number[] {
  const modeBytes = new TextEncoder().encode(input.mode)
  const profileBytes = new TextEncoder().encode(input.profileId)
  return [
    0xa3,
    0x01,
    0x60 + modeBytes.length,
    ...modeBytes,
    0x02,
    0x58,
    input.nonce.length,
    ...input.nonce,
    0x03,
    0x60 + profileBytes.length,
    ...profileBytes,
  ]
}

if (require.main === module) {
  console.info(
    'companion_probe: stub only — wire ACS SDK and run against armed Wallet HCE. See tools/acr1311u-n2/README.md',
  )
}
