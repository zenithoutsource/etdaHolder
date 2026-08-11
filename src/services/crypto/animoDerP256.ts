import { p256 } from '@noble/curves/nist.js'

/** Convert Animo/Android DER ECDSA signature to JOSE 64-byte r‖s. */
export function derEcdsaSignatureToJoseRaw(derSignature: Uint8Array): Uint8Array {
  const { r, s } = parseDerEcdsaSignature(derSignature)
  const raw = new Uint8Array(64)
  raw.set(normalizeScalarTo32Bytes(r), 0)
  raw.set(normalizeScalarTo32Bytes(s), 32)
  return raw
}

/** Parse SubjectPublicKeyInfo DER from Animo into compressed P-256 bytes. */
export function spkiDerToCompressedP256PublicKey(spkiDer: Uint8Array): Uint8Array {
  for (let index = 0; index <= spkiDer.length - 65; index += 1) {
    if (spkiDer[index] !== 0x04) continue
    const uncompressed = spkiDer.slice(index, index + 65)
    try {
      return p256.Point.fromBytes(uncompressed).toBytes(true)
    } catch {
      continue
    }
  }

  throw new Error('InvalidSpkiDerP256')
}

function normalizeScalarTo32Bytes(value: Uint8Array): Uint8Array {
  if (value.length === 32) return value
  if (value.length > 32) return value.slice(value.length - 32)
  const padded = new Uint8Array(32)
  padded.set(value, 32 - value.length)
  return padded
}

function parseDerEcdsaSignature(der: Uint8Array): { r: Uint8Array; s: Uint8Array } {
  let offset = 0

  function readByte(): number {
    if (offset >= der.length) throw new Error('InvalidDerEcdsaSignature')
    return der[offset++]!
  }

  if (readByte() !== 0x30) throw new Error('InvalidDerEcdsaSignature')

  const seqLength = readDerLength(readByte(), der, () => readByte())
  const seqEnd = offset + seqLength

  if (readByte() !== 0x02) throw new Error('InvalidDerEcdsaSignature')
  const rLength = readDerLength(readByte(), der, () => readByte())
  const r = der.slice(offset, offset + rLength)
  offset += rLength

  if (readByte() !== 0x02) throw new Error('InvalidDerEcdsaSignature')
  const sLength = readDerLength(readByte(), der, () => readByte())
  const s = der.slice(offset, offset + sLength)
  offset += sLength

  if (offset !== seqEnd) throw new Error('InvalidDerEcdsaSignature')
  return { r, s }
}

function readDerLength(firstLengthByte: number, input: Uint8Array, readNext: () => number): number {
  if ((firstLengthByte & 0x80) === 0) return firstLengthByte

  const byteCount = firstLengthByte & 0x7f
  if (byteCount === 0 || byteCount > 4) throw new Error('InvalidDerEcdsaSignature')

  let length = 0
  for (let index = 0; index < byteCount; index += 1) {
    length = (length << 8) | readNext()
  }
  return length
}
