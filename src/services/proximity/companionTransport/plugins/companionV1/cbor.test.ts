import {
  decodeCompanionBeginRequest,
  decodeCompanionCapabilities,
  encodeCompanionBeginRequest,
  encodeCompanionCapabilities,
} from './cbor'
import { COMPANION_CAPABILITIES_V1_DEFAULTS } from './constants'

test('round-trips companion capabilities CBOR', () => {
  const encoded = encodeCompanionCapabilities(COMPANION_CAPABILITIES_V1_DEFAULTS)
  const decoded = decodeCompanionCapabilities(encoded)

  expect(decoded.version).toBe(1)
  expect(decoded.supportedModes).toEqual(['mdoc-only', 'dual-format'])
  expect(decoded.activeProfileId).toBe('etda-transcript-acr1311u-n2')
  expect(decoded.maxCompanionBytes).toBe(65_536)
})

test('round-trips BEGIN COMPANION request CBOR', () => {
  const nonce = new Uint8Array(32).map((_, index) => index)
  const encoded = encodeCompanionBeginRequest({
    mode: 'dual-format',
    nonce,
    profileId: 'etda-transcript-acr1311u-n2',
  })

  expect(decodeCompanionBeginRequest(encoded)).toEqual({
    mode: 'dual-format',
    nonce,
    profileId: 'etda-transcript-acr1311u-n2',
  })
})
