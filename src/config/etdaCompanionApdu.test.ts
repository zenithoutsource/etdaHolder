import {
  ETDA_COMPANION_AID_HEX,
  ETDA_COMPANION_INS,
  ETDA_COMPANION_NONCE_BYTES,
  ETDA_COMPANION_PROTOCOL_VERSION,
  isEtdaCompanionMode,
} from './etdaCompanionApdu'

test('pins ETDA companion AID from spec', () => {
  expect(ETDA_COMPANION_AID_HEX).toBe('A0000004544410100')
  expect(ETDA_COMPANION_PROTOCOL_VERSION).toBe(1)
  expect(ETDA_COMPANION_NONCE_BYTES).toBe(32)
})

test('companion INS bytes match spec command table', () => {
  expect(ETDA_COMPANION_INS.GET_CAPABILITIES).toBe(0xca)
  expect(ETDA_COMPANION_INS.BEGIN_COMPANION).toBe(0xcb)
  expect(ETDA_COMPANION_INS.GET_RESPONSE).toBe(0xc0)
  expect(ETDA_COMPANION_INS.ABORT).toBe(0xff)
})

test('isEtdaCompanionMode validates mode strings', () => {
  expect(isEtdaCompanionMode('dual-format')).toBe(true)
  expect(isEtdaCompanionMode('mdoc-only')).toBe(true)
  expect(isEtdaCompanionMode('unknown')).toBe(false)
})
