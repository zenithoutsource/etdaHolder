import { p256 } from '@noble/curves/nist.js'

import { derEcdsaSignatureToJoseRaw, spkiDerToCompressedP256PublicKey } from './animoDerP256'
import { verifyEs256Prehash } from './p256Identity'

describe('animoDerP256', () => {
  test('derEcdsaSignatureToJoseRaw converts DER to 64-byte r‖s', () => {
    const { secretKey } = p256.keygen()
    const message = new Uint8Array([0x01, 0x02, 0x03])
    const der = p256.sign(message, secretKey, { format: 'der', prehash: true, lowS: true })
    const raw = derEcdsaSignatureToJoseRaw(der)

    expect(raw).toHaveLength(64)
    expect(verifyEs256Prehash(message, raw, p256.getPublicKey(secretKey, true))).toBe(true)
  })

  test('spkiDerToCompressedP256PublicKey extracts compressed key from SPKI DER', () => {
    const { secretKey } = p256.keygen()
    const uncompressed = p256.getPublicKey(secretKey, false)
    const spkiDer = buildMinimalSpkiDer(uncompressed)
    const compressed = spkiDerToCompressedP256PublicKey(spkiDer)

    expect(compressed).toHaveLength(33)
    expect(compressed[0]).toBeGreaterThanOrEqual(0x02)
    expect(compressed[0]).toBeLessThanOrEqual(0x03)
  })
})

function buildMinimalSpkiDer(uncompressed: Uint8Array): Uint8Array {
  const prefix = new Uint8Array([0x30, 0x59, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x03, 0x42, 0x00])
  const out = new Uint8Array(prefix.length + uncompressed.length)
  out.set(prefix, 0)
  out.set(uncompressed, prefix.length)
  return out
}
