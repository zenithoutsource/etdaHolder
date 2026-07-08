import { validateProximityArmPayload } from './proximityArmPolicy'

test('rejects combined NFC payload above configured cap', () => {
  expect(() =>
    validateProximityArmPayload({
      mdocPayloadBytes: 40_000,
      companionPayloadBytes: 30_000,
    }),
  ).toThrow('ProximityPayloadTooLarge')
})

test('accepts payload within cap', () => {
  expect(() =>
    validateProximityArmPayload({
      mdocPayloadBytes: 10_000,
      companionPayloadBytes: 10_000,
    }),
  ).not.toThrow()
})
