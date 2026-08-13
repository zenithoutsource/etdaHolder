#!/usr/bin/env node
/**
 * Dev helper: build an OID4VCI 1.0 PoP JWT for Swagger/curl.
 *
 * Default matches current driving-licence wallet hardware PoP (k_cred P-256):
 *   alg ES256, typ openid4vci-proof+jwt, header jwk + kid, payload { aud, iat, nonce }.
 * Dual-format claim posts that proof twice: dc+sd-jwt first, then mso_mdoc.
 * Request bodies are { credential_configuration_id, proofs.jwt } — no doctype/format/cose_key.
 *
 * Usage:
 *   node scripts/generate-oid4vci-pop-jwt.mjs --nonce=<c_nonce from POST /token>
 *   node scripts/generate-oid4vci-pop-jwt.mjs --nonce=abc
 *   node scripts/generate-oid4vci-pop-jwt.mjs --nonce=abc --alg=EdDSA --key-binding=did-kid
 *
 * --alg=ES256 (default) | EdDSA
 * --key-binding=jwk (default for ES256) | did-kid (default for EdDSA)
 * --mdoc-configuration-id=org.iso.18013.5.1.mDL
 * --sd-jwt-configuration-id=Iso18013DriversLicenseCredential_dc+sd-jwt
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

function decodeJwtPart(part) {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
}

function oid4vci10CredentialRequest(configurationId, proofJwt) {
  return {
    credential_configuration_id: configurationId,
    proofs: { jwt: [proofJwt] },
  }
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
          kid,
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
const alg = (readArg('alg') ?? 'ES256').toUpperCase()
const keyBinding = (
  readArg('key-binding') ?? (alg === 'ES256' ? 'jwk' : 'did-kid')
).toLowerCase()
const mdocConfigurationId = readArg('mdoc-configuration-id') ?? 'org.iso.18013.5.1.mDL'
const sdJwtConfigurationId =
  readArg('sd-jwt-configuration-id') ?? 'Iso18013DriversLicenseCredential_dc+sd-jwt'
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

const [headerB64, payloadB64] = result.proofJwt.split('.')
const header = decodeJwtPart(headerB64)
const payload = decodeJwtPart(payloadB64)

console.log(
  JSON.stringify(
    {
      proofJwt: result.proofJwt,
      header,
      payload,
      holderDid: result.holderDid,
      kid: result.kid,
      alg: result.alg,
      ...(result.keyBinding ? { keyBinding: result.keyBinding } : {}),
      audience,
      nonce,
      iat,
      publicJwk: result.publicJwk,
      credentialRequests: {
        'dc+sd-jwt': oid4vci10CredentialRequest(sdJwtConfigurationId, result.proofJwt),
        mso_mdoc: oid4vci10CredentialRequest(mdocConfigurationId, result.proofJwt),
      },
      ...(seedHex ? {} : { ephemeralSeedHex: Buffer.from(seed).toString('hex') }),
    },
    null,
    2,
  ),
)
