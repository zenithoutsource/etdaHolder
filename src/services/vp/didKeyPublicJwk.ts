const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])

export type Ed25519PublicJwk = {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
}

function base58Decode(input: string): Uint8Array {
  let zeros = 0
  for (const char of input) {
    if (char !== '1') break
    zeros += 1
  }

  let value = 0n
  for (const char of input) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index < 0) throw new Error('InvalidBase58')
    value = value * 58n + BigInt(index)
  }

  let hex = value.toString(16)
  if (hex.length % 2 === 1) hex = `0${hex}`
  const decoded = hex.length > 0 ? hex.match(/.{1,2}/g)!.map((byte) => Number.parseInt(byte, 16)) : []
  const bytes = new Uint8Array(zeros + decoded.length)
  bytes.set(decoded, zeros)
  return bytes
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function didKeyToEd25519PublicJwk(didKey: string): Ed25519PublicJwk {
  const did = didKey.startsWith('did:key:') ? didKey.split('#')[0]! : `did:key:${didKey.split('#')[0]!}`
  const multibase = did.slice('did:key:'.length)
  if (!multibase.startsWith('z')) {
    throw new Error('UnsupportedDidKeyEncoding')
  }

  const raw = base58Decode(multibase.slice(1))
  if (
    raw.length < ED25519_MULTICODEC_PREFIX.length + 32 ||
    raw[0] !== ED25519_MULTICODEC_PREFIX[0] ||
    raw[1] !== ED25519_MULTICODEC_PREFIX[1]
  ) {
    throw new Error('UnsupportedDidKeyType')
  }

  const publicKey = raw.slice(ED25519_MULTICODEC_PREFIX.length, ED25519_MULTICODEC_PREFIX.length + 32)
  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: bytesToBase64Url(publicKey),
  }
}
