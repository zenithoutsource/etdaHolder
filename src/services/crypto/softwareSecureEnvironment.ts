import { subtle } from 'react-native-quick-crypto'
import type { SecureEnvironment } from '@animo-id/expo-secure-environment'

import { getMetaStorage } from '../storage/storage'

const PREFIX = 'sw_key:'

type StoredKeyPair = {
  privateJwk: JsonWebKey
  publicCompressedB64: string
}

function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function bytesToB64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function b64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')
  return b64ToBytes(padded)
}

async function generateStoredKeyPair(): Promise<StoredKeyPair> {
  const keyPair = await subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )

  const privateJwk = await subtle.exportKey('jwk', (keyPair as CryptoKeyPair).privateKey)
  const publicJwk = await subtle.exportKey('jwk', (keyPair as CryptoKeyPair).publicKey)

  const x = b64urlToBytes((publicJwk as JsonWebKey).x!)
  const y = b64urlToBytes((publicJwk as JsonWebKey).y!)
  const compressed = new Uint8Array(33)
  compressed[0] = y[31] % 2 === 0 ? 0x02 : 0x03
  compressed.set(x, 1)

  return {
    privateJwk: privateJwk as JsonWebKey,
    publicCompressedB64: bytesToB64(compressed),
  }
}

function loadStoredKeyPair(keyId: string): StoredKeyPair | undefined {
  const raw = getMetaStorage().getString(`${PREFIX}${keyId}`)
  if (!raw) return undefined
  return JSON.parse(raw) as StoredKeyPair
}

function saveStoredKeyPair(keyId: string, pair: StoredKeyPair): void {
  getMetaStorage().set(`${PREFIX}${keyId}`, JSON.stringify(pair))
}

export const softwareSecureEnvironment: SecureEnvironment = {
  async generateKeypair(keyId: string): Promise<Uint8Array> {
    const pair = await generateStoredKeyPair()
    saveStoredKeyPair(keyId, pair)
    return b64ToBytes(pair.publicCompressedB64)
  },

  async batchGenerateKeyPair(keyIds: string[]): Promise<Record<string, Uint8Array>> {
    const result: Record<string, Uint8Array> = {}
    for (const keyId of keyIds) {
      result[keyId] = await softwareSecureEnvironment.generateKeypair(keyId)
    }
    return result
  },

  async getPublicBytesForKeyId(keyId: string): Promise<Uint8Array> {
    const pair = loadStoredKeyPair(keyId)
    if (!pair) throw new Error(`SoftwareKeyNotFound: ${keyId}`)
    return b64ToBytes(pair.publicCompressedB64)
  },

  async sign(keyId: string, message: Uint8Array): Promise<Uint8Array> {
    const pair = loadStoredKeyPair(keyId)
    if (!pair) throw new Error(`SoftwareKeyNotFound: ${keyId}`)

    const privateKey = await subtle.importKey(
      'jwk',
      pair.privateJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    )

    // subtle ECDSA returns IEEE P1363 = raw R||S (64 bytes) — no DER conversion needed
    const sigBuf = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, message)
    return new Uint8Array(sigBuf)
  },

  async deleteKey(keyId: string): Promise<void> {
    getMetaStorage().delete(`${PREFIX}${keyId}`)
  },
}
