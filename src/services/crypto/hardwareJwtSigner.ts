import { createHash } from 'react-native-quick-crypto'

import { logWalletStep } from '@/src/services/debug/walletLogger'

import type { EcP256Jwk } from './hardwareEcdsaTypes'
import {
  assertEs256SignatureBytes,
  p256PublicKeyToCoseKey,
} from './p256Identity'
import type { TransactionDataPresentationContext } from '@/src/services/vp/transactionDataKbJwt'
import { buildTransactionDataKbJwtClaims } from '@/src/services/vp/transactionDataKbJwt'
import { normalizeSdJwtWithoutKb } from './sdJwtNormalize'

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** RFC 8152 COSE_Key for P-256 EC2 (ISO 18013-5 device key shape). */
export function encodeP256CoseKeyBase64Url(publicKey: Uint8Array): string {
  const cose = p256PublicKeyToCoseKey(publicKey)
  const x = cose[-2]
  const y = cose[-3]
  const out = new Uint8Array(4 + 2 + 2 + 2 + 2 + 2 + 32 + 2 + 32)
  let i = 0
  out[i++] = 0xa5
  out[i++] = 0x01
  out[i++] = 0x02
  out[i++] = 0x03
  out[i++] = 0x26
  out[i++] = 0x20
  out[i++] = 0x01
  out[i++] = 0x21
  out[i++] = 0x58
  out[i++] = 0x20
  out.set(x, i)
  i += 32
  out[i++] = 0x22
  out[i++] = 0x58
  out[i++] = 0x20
  out.set(y, i)
  return base64UrlEncode(out)
}

export async function signEs256Jwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  sign: (message: Uint8Array) => Promise<Uint8Array>,
  tokenKind: string,
): Promise<string> {
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  const signatureBytes = await sign(new TextEncoder().encode(signingInput))
  assertEs256SignatureBytes(signatureBytes)

  logWalletStep('hardware-ecdsa', 'es256-jwt-signed', {
    tokenKind,
    alg: header.alg,
    signatureBytes: signatureBytes.length,
    signingInputBytes: signingInput.length,
  })

  return `${signingInput}.${base64UrlEncode(signatureBytes)}`
}

export type HardwareSignProofInput = {
  nonce: string
  audience: string
  keyBinding?: 'did-kid' | 'jwk' | 'jwk-kid'
  publicJwk: EcP256Jwk
  holderDid: string
  sign: (message: Uint8Array) => Promise<Uint8Array>
}

export async function signHardwareProofJwt(input: HardwareSignProofInput): Promise<string> {
  // OID4VCI proof JWT allows exactly one of kid | jwk | x5c. Procivis maps
  // both kid and jwk to invalid_or_missing_proof, so default mdoc PoP is jwk-only.
  // Some issuers (zenithcomp mDL) still require a kid header while binding the
  // ISO device key from jwk — use jwk-kid only for that path.
  const keyBinding = input.keyBinding ?? 'jwk'
  const publicJwk = {
    kty: input.publicJwk.kty,
    crv: input.publicJwk.crv,
    x: input.publicJwk.x,
    y: input.publicJwk.y,
  }
  const kid = `${input.holderDid}#${input.holderDid.slice('did:key:'.length)}`

  const header =
    keyBinding === 'did-kid'
      ? {
          alg: 'ES256' as const,
          typ: 'openid4vci-proof+jwt' as const,
          kid,
        }
      : {
          alg: 'ES256' as const,
          typ: 'openid4vci-proof+jwt' as const,
          jwk: publicJwk,
          ...(keyBinding === 'jwk-kid' ? { kid } : {}),
        }

  const payload = {
    aud: input.audience,
    iat: Math.floor(Date.now() / 1000),
    nonce: input.nonce,
  }

  logWalletStep('hardware-ecdsa', 'sign-proof-start', {
    alg: header.alg,
    keyBinding,
    hasJwk: 'jwk' in header,
    hasKid: 'kid' in header,
    jwkKty: 'jwk' in header ? publicJwk.kty : undefined,
    jwkCrv: 'jwk' in header ? publicJwk.crv : undefined,
    coseKeyPresent: 'cose_key' in header,
    audience: input.audience,
    noncePresent: Boolean(input.nonce),
  })

  return signEs256Jwt(header, payload, input.sign, 'proof')
}

export async function signHardwareSdJwtKbPresentationToken(input: {
  audience: string
  nonce: string
  sdJwt: string
  holderDid: string
  kid?: string
  /** @deprecated eudi-dev wire profile omits KB header key material; kept for call-site compatibility. */
  publicJwk?: EcP256Jwk
  transactionData?: TransactionDataPresentationContext
  sign: (message: Uint8Array) => Promise<Uint8Array>
}): Promise<string> {
  const sdJwtWithoutKb = normalizeSdJwtWithoutKb(input.sdJwt)
  const sdHash = base64UrlEncode(
    createHash('sha256').update(new TextEncoder().encode(sdJwtWithoutKb)).digest(),
  )

  // Match eudi-dev createKBJWT: header is alg+typ only; binding comes from cnf + signature.
  const header = {
    alg: 'ES256',
    typ: 'kb+jwt',
  }
  const iat = Math.floor(Date.now() / 1000)
  const payload = {
    aud: input.audience,
    iat,
    nonce: input.nonce,
    sd_hash: sdHash,
    ...buildTransactionDataKbJwtClaims(input.transactionData),
  }

  const kbJwt = await signEs256Jwt(header, payload, input.sign, 'kb')
  return `${sdJwtWithoutKb}${kbJwt}`
}

export async function signHardwarePresentationVpToken(input: {
  audience: string
  nonce: string
  verifiableCredential: string
  holderDid: string
  kid: string
  jti: string
  sign: (message: Uint8Array) => Promise<Uint8Array>
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'ES256', typ: 'JWT', kid: input.kid }
  const payload = {
    iss: input.holderDid,
    sub: input.holderDid,
    jti: input.jti,
    aud: input.audience,
    nbf: now,
    iat: now,
    exp: now + 300,
    nonce: input.nonce,
    vp: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiablePresentation'],
      holder: input.holderDid,
      verifiableCredential: [input.verifiableCredential],
    },
  }

  return signEs256Jwt(header, payload, input.sign, 'vp')
}

export async function signHardwareHolderStatusChangePop(input: {
  nonce: string
  audience: string
  credentialId: string
  holderDid: string
  kid: string
  action?: 'revoke'
  sign: (message: Uint8Array) => Promise<Uint8Array>
}): Promise<string> {
  const header = { alg: 'ES256', typ: 'holder-status-change+jwt', kid: input.kid }
  const payload = {
    iss: input.holderDid,
    sub: input.holderDid,
    aud: input.audience,
    iat: Math.floor(Date.now() / 1000),
    nonce: input.nonce,
    credential_id: input.credentialId,
    action: input.action ?? 'revoke',
  }

  return signEs256Jwt(header, payload, input.sign, 'holder-status-change-pop')
}
