#!/usr/bin/env node
/**
 * Dev helper: build an OID4VCI 1.0 PoP JWT for Swagger/curl.
 *
 * Usage:
 *   node scripts/generate-oid4vci-pop-jwt.mjs --nonce=<c_nonce from POST /token>
 *   node scripts/generate-oid4vci-pop-jwt.mjs --nonce=abc --alg=ES256
 *   node scripts/generate-oid4vci-pop-jwt.mjs --nonce=abc --alg=EdDSA --audience=https://issuer.zenithcomp.co.th:455
 *   node scripts/generate-oid4vci-pop-jwt.mjs --nonce=abc --alg=ES256 --key-binding=jwk
 *
 * --alg=EdDSA (default): ephemeral Ed25519 did:key (z6Mk…)
 * --alg=ES256: ephemeral P-256 did:key (zDnae…) matching wallet hardware PoP shape
 * --key-binding=did-kid (default) | jwk  (ES256 only; jwk also embeds cose_key)
 *
 * Uses a fresh ephemeral key unless --seed=<64 hex chars> is set (32-byte seed for both algs).
 */
import { getPublicKey, sign as signEd25519, hashes } from '@noble/ed25519'
import { p256 } from '@noble/curves/nist.js'
import { createHash, randomBytes } from 'node:crypto'

hashes.sha512 = (...messages) => {
  const hash = createHash('sha512')
  for (const message of messages) hash.update(message)
  return new Uint8Array(hash.digest())
}

const ED25519_MULTICODEC_PREFIX = new Uint8Array([0xed, 0x01])
/** multicodec varint(0x1200) for P-256 compressed public keys */
const P256_MULTICODEC_PREFIX = new Uint8Array([0x80, 0x24])
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58btcEncode(bytes) {
  let zeros = 0
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1
  const input = Array.from(bytes)
  const encoded = []
  for (const byte of input) {
    let carry = byte
    for (let j = 0; j < encoded.length; j++) {
      carry += encoded[j] << 8
      encoded[j] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      encoded.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  let output = '1'.repeat(zeros)
  for (let i = encoded.length - 1; i >= 0; i--) {
    output += BASE58_ALPHABET[encoded[i]]
  }
  return output
}

function publicKeyToDidKey(publicKey, multicodecPrefix) {
  const multicodecBytes = new Uint8Array(multicodecPrefix.length + publicKey.length)
  multicodecBytes.set(multicodecPrefix)
  multicodecBytes.set(publicKey, multicodecPrefix.length)
  return `did:key:z${base58btcEncode(multicodecBytes)}`
}

function base64UrlEncode(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function readArg(name) {
  const prefix = `--${name}=`
  const hit = process.argv.find((arg) => arg.startsWith(prefix))
  return hit ? hit.slice(prefix.length) : undefined
}

function compressP256PublicKey(publicKey) {
  if (publicKey.length === 33) return publicKey
  if (publicKey.length === 65 && publicKey[0] === 0x04) {
    return p256.Point.fromBytes(publicKey).toBytes(true)
  }
  throw new Error(`Invalid P-256 public key length: ${publicKey.length}`)
}

function p256PublicKeyToJwk(publicKey) {
  const uncompressed =
    publicKey.length === 65 && publicKey[0] === 0x04
      ? publicKey
      : p256.Point.fromBytes(publicKey).toBytes(false)
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(uncompressed.slice(1, 33)),
    y: base64UrlEncode(uncompressed.slice(33, 65)),
  }
}

/** COSE_Key map for EC2 P-256 / ES256, base64url of CBOR. Minimal definite-length encoding. */
function encodeP256CoseKeyBase64Url(compressedOrRawPublicKey) {
  const uncompressed =
    compressedOrRawPublicKey.length === 65 && compressedOrRawPublicKey[0] === 0x04
      ? compressedOrRawPublicKey
      : p256.Point.fromBytes(compressedOrRawPublicKey).toBytes(false)
  const x = uncompressed.slice(1, 33)
  const y = uncompressed.slice(33, 65)
  // {1:2, 3:-7, -1:1, -2:x, -3:y} as CBOR map(5)
  const parts = [
    Buffer.from([0xa5]),
    Buffer.from([0x01, 0x02]),
    Buffer.from([0x03, 0x26]),
    Buffer.from([0x20, 0x01]),
    Buffer.from([0x21, 0x58, 0x20]),
    Buffer.from(x),
    Buffer.from([0x22, 0x58, 0x20]),
    Buffer.from(y),
  ]
  return base64UrlEncode(Buffer.concat(parts))
}

function buildEdDsaProof(seed, audience, nonce, iat) {
  const publicKey = getPublicKey(seed)
  const holderDid = publicKeyToDidKey(publicKey, ED25519_MULTICODEC_PREFIX)
  const kid = `${holderDid}#${holderDid.slice('did:key:'.length)}`
  const header = {
    alg: 'EdDSA',
    typ: 'openid4vci-proof+jwt',
    kid,
  }
  const payload = { aud: audience, iat, nonce }
  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = signEd25519(new TextEncoder().encode(signingInput), seed)
  return {
    proofJwt: `${signingInput}.${base64UrlEncode(signature)}`,
    holderDid,
    kid,
    alg: 'EdDSA',
    publicJwk: {
      kty: 'OKP',
      crv: 'Ed25519',
      x: base64UrlEncode(publicKey),
    },
  }
}

function buildEs256Proof(seed, audience, nonce, iat, keyBinding) {
  const secretKey = new Uint8Array(seed)
  const publicKey = compressP256PublicKey(p256.getPublicKey(secretKey, true))
  const holderDid = publicKeyToDidKey(publicKey, P256_MULTICODEC_PREFIX)
  const publicJwk = p256PublicKeyToJwk(publicKey)
  const kid = `${holderDid}#${holderDid.slice('did:key:'.length)}`

  const header =
    keyBinding === 'jwk'
      ? {
          alg: 'ES256',
          typ: 'openid4vci-proof+jwt',
          jwk: publicJwk,
          cose_key: encodeP256CoseKeyBase64Url(publicKey),
        }
      : {
          alg: 'ES256',
          typ: 'openid4vci-proof+jwt',
          kid,
        }

  const payload = { aud: audience, iat, nonce }
  const headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)))
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload)))
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = p256.sign(new TextEncoder().encode(signingInput), secretKey, {
    lowS: true,
    prehash: true,
  })
  if (signature.length !== 64) {
    throw new Error(`Invalid ES256 signature length: ${signature.length}`)
  }

  return {
    proofJwt: `${signingInput}.${base64UrlEncode(signature)}`,
    holderDid,
    kid,
    alg: 'ES256',
    keyBinding,
    publicJwk,
  }
}

const nonce = readArg('nonce')
if (!nonce) {
  console.error('Missing --nonce=<c_nonce from POST /token response>')
  process.exit(1)
}

const audience = readArg('audience') ?? 'https://issuer.zenithcomp.co.th:455'
const alg = (readArg('alg') ?? 'EdDSA').toUpperCase()
const keyBinding = (readArg('key-binding') ?? 'did-kid').toLowerCase()
const seedHex = readArg('seed')
const seed = seedHex ? Buffer.from(seedHex, 'hex') : randomBytes(32)
if (seed.length !== 32) {
  console.error('--seed must be 32 bytes (64 hex chars)')
  process.exit(1)
}

if (alg !== 'EDDSA' && alg !== 'ES256') {
  console.error('--alg must be EdDSA or ES256')
  process.exit(1)
}

if (keyBinding !== 'did-kid' && keyBinding !== 'jwk') {
  console.error('--key-binding must be did-kid or jwk')
  process.exit(1)
}

if (alg === 'EDDSA' && keyBinding === 'jwk') {
  console.error('--key-binding=jwk is only supported with --alg=ES256')
  process.exit(1)
}

const iat = Math.floor(Date.now() / 1000)
const result =
  alg === 'ES256'
    ? buildEs256Proof(seed, audience, nonce, iat, keyBinding)
    : buildEdDsaProof(seed, audience, nonce, iat)

console.log(
  JSON.stringify(
    {
      proofJwt: result.proofJwt,
      holderDid: result.holderDid,
      kid: result.kid,
      alg: result.alg,
      ...(result.keyBinding ? { keyBinding: result.keyBinding } : {}),
      audience,
      nonce,
      iat,
      publicJwk: result.publicJwk,
      ...(seedHex ? {} : { ephemeralSeedHex: Buffer.from(seed).toString('hex') }),
    },
    null,
    2,
  ),
)
