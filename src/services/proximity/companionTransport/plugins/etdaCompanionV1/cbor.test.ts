import {
  decodeEtdaCompanionBeginRequest,
  decodeEtdaCompanionCapabilities,
  encodeEtdaCompanionBeginRequest,
  encodeEtdaCompanionCapabilities,
} from './cbor'
import { ETDA_COMPANION_CAPABILITIES_V1_DEFAULTS } from './constants'

test('round-trips ETDA companion capabilities CBOR', () => {
  const encoded = encodeEtdaCompanionCapabilities(ETDA_COMPANION_CAPABILITIES_V1_DEFAULTS)
  const decoded = decodeEtdaCompanionCapabilities(encoded)

  expect(decoded.version).toBe(1)
  expect(decoded.supportedModes).toEqual(['mdoc-only', 'dual-format'])
  expect(decoded.activeProfileId).toBe('etda-transcript-acr1311u-n2')
  expect(decoded.maxCompanionBytes).toBe(65_536)
})

test('round-trips BEGIN COMPANION request CBOR', () => {
  const nonce = new Uint8Array(32).map((_, index) => index)
  const encoded = encodeEtdaCompanionBeginRequest({
    mode: 'dual-format',
    nonce,
    profileId: 'etda-transcript-acr1311u-n2',
  })

  expect(decodeEtdaCompanionBeginRequest(encoded)).toEqual({
    mode: 'dual-format',
    nonce,
    profileId: 'etda-transcript-acr1311u-n2',
  })
})
