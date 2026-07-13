import { estimateCompanionPayloadBytes } from './companionPayloadSize'
import { COMPANION_PLUGIN_ID } from './companionTransport/plugins/companionV1/constants'

test('estimateCompanionPayloadBytes includes SD-JWT body and plugin nonce overhead', () => {
  const rawVc = 'eyJhbGciOiJFUzI1NiJ9.payload~disclosure~sig'
  const sdJwtBytes = new TextEncoder().encode(rawVc).length
  const plugin = { nonceBytes: 32 }
  expect(estimateCompanionPayloadBytes(rawVc, COMPANION_PLUGIN_ID)).toBe(
    sdJwtBytes + 512 + plugin.nonceBytes,
  )
})
