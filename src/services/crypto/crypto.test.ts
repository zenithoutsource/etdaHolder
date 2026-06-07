import {
  generateKeypair,
  getPublicBytesForKeyId,
  sign,
} from '@animo-id/expo-secure-environment'

import {
  generateWalletKeyIfNeeded,
  getHolderDid,
  signProof,
} from './crypto'
import { getMetaStorage } from '../storage/storage'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const P256_DID_KEY_VECTOR = 'did:key:zDnaerx9CtbPJ1q36T5Ln5wYt3MQYeGRG5ehnPAmxcf5mDZpv'

function base58btcDecode(value: string): Uint8Array {
  let n = 0n
  for (const char of value) {
    const index = BASE58_ALPHABET.indexOf(char)
    if (index === -1) throw new Error(`invalid base58 char ${char}`)
    n = n * 58n + BigInt(index)
  }

  const bytes: number[] = []
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn))
    n >>= 8n
  }

  for (const char of value) {
    if (char !== '1') break
    bytes.unshift(0)
  }

  return new Uint8Array(bytes)
}

function p256CompressedKeyFromDidKey(did: string): Uint8Array {
  const fingerprint = did.replace('did:key:z', '')
  const multicodecBytes = base58btcDecode(fingerprint)
  expect(Array.from(multicodecBytes.slice(0, 2))).toEqual([0x80, 0x24])
  return multicodecBytes.slice(2)
}

function base64UrlDecode(value: string): Record<string, unknown> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  return JSON.parse(atob(padded)) as Record<string, unknown>
}

describe('wallet did:key crypto service', () => {
  beforeEach(() => {
    getMetaStorage().clearAll()
    jest.clearAllMocks()
  })

  test('derives Holder DID from compressed P-256 did:key bytes', async () => {
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(p256CompressedKeyFromDidKey(P256_DID_KEY_VECTOR))

    await generateWalletKeyIfNeeded()

    expect(generateKeypair).toHaveBeenCalledWith('etda_wallet_signing_key', true)
    expect(getHolderDid()).toBe(P256_DID_KEY_VECTOR)
  })

  test('signs PoP JWT with Holder DID issuer and did:key verification method kid', async () => {
    jest.mocked(getPublicBytesForKeyId).mockResolvedValue(p256CompressedKeyFromDidKey(P256_DID_KEY_VECTOR))
    jest.mocked(sign).mockResolvedValue(new Uint8Array(64).fill(7))

    await generateWalletKeyIfNeeded()
    const jwt = await signProof('nonce-123', 'https://issuer.example.com')
    const [encodedHeader, encodedPayload] = jwt.split('.')

    expect(base64UrlDecode(encodedHeader)).toMatchObject({
      alg: 'ES256',
      typ: 'openid4vci-proof+jwt',
      kid: `${P256_DID_KEY_VECTOR}#${P256_DID_KEY_VECTOR.replace('did:key:', '')}`,
    })
    expect(base64UrlDecode(encodedPayload)).toMatchObject({
      iss: P256_DID_KEY_VECTOR,
      aud: 'https://issuer.example.com',
      nonce: 'nonce-123',
    })
    expect(sign).toHaveBeenCalledWith(
      'etda_wallet_signing_key',
      expect.any(Uint8Array),
      true,
    )
  })
})
