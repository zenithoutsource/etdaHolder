import {
  clientAuthenticationAnonymous,
  clientAuthenticationClientAttestationJwt,
  createClientAttestationJwt,
  type ClientAuthenticationCallback,
  type SignJwtCallback,
} from '@openid4vc/oauth2'
import type { IssuerMetadataResult } from '@openid4vc/openid4vci'
import { randomBytes } from 'react-native-quick-crypto'

import { readDefaultMaxSignatures } from '@/src/config/hardwareSigningPolicy'
import { readOid4vcClientAttestationTtlMs } from '@/src/config/walletCryptoPolicy'
import { getHardwareEcdsaSigner } from '@/src/services/crypto/hardwareEcdsaSigner'
import {
  HardwareEcdsaUnavailableError,
  HardwareKeyNotFoundError,
  WALLET_P256_ATTEST_ALIAS,
  type EcP256Jwk,
  type HardwareSigningSession,
} from '@/src/services/crypto/hardwareEcdsaTypes'
import { signEs256Jwt } from '@/src/services/crypto/hardwareJwtSigner'
import { readCachedWalletAttestations } from '@/src/services/crypto/walletCryptoActivation'
import { resolveWalletProviderBaseUrl } from '@/src/services/crypto/walletAttestClient'
import { logWalletStep } from '@/src/services/debug/walletLogger'
import { decodeJwtHeader, isRecord, readString } from '@/src/utils/jwtUtils'

const ATTEST_JWT_CLIENT_AUTH = 'attest_jwt_client_auth'
const CLIENT_ATTESTATION_JWT_TYP = 'oauth-client-attestation+jwt'
const CLIENT_ATTESTATION_POP_TYP = 'oauth-client-attestation-pop+jwt'
const WALLET_OAUTH_CLIENT_ID = 'wallet-holder'
const WALLET_ATTESTATION_REQUIRED =
  'WalletAttestationRequired: this issuer requires wallet attestation'

export function authorizationServerRequiresClientAttestation(
  issuerMetadataResult: Pick<IssuerMetadataResult, 'authorizationServers' | 'credentialIssuer'>,
): boolean {
  const servers = issuerMetadataResult.authorizationServers ?? []
  if (servers.some(serverAdvertisesClientAttestation)) return true
  return serverAdvertisesClientAttestation(issuerMetadataResult.credentialIssuer)
}

function serverAdvertisesClientAttestation(server: unknown): boolean {
  if (!isRecord(server)) return false
  const methods = server.token_endpoint_auth_methods_supported
  return Array.isArray(methods) && methods.includes(ATTEST_JWT_CLIENT_AUTH)
}

export function isOauthClientAttestationJwt(jwt: string): boolean {
  const header = decodeJwtHeader(jwt)
  if (!header) return false
  const alg = readString(header.alg)
  if (!alg || alg.toLowerCase() === 'none') return false
  return header.typ === CLIENT_ATTESTATION_JWT_TYP
}

function readCachedFreshWalletUnitAttestation(
  now = Date.now(),
): { jwt: string; expiresAtMs: number } | undefined {
  const cached = readCachedWalletAttestations().wua
  if (!cached?.value) return undefined
  const expiresAtMs = Date.parse(cached.expiresAt)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now) return undefined
  return { jwt: cached.value, expiresAtMs }
}

function resolveClientAttestationIssuer(): string | undefined {
  try {
    const walletProviderUrl = resolveWalletProviderBaseUrl()
    return walletProviderUrl.startsWith('https://') ? walletProviderUrl : undefined
  } catch {
    return undefined
  }
}

function resolveMintedAttestationExpiresAt(cachedExpiresAtMs: number | undefined, now = Date.now()): Date {
  if (cachedExpiresAtMs && cachedExpiresAtMs > now) {
    return new Date(cachedExpiresAtMs)
  }
  return new Date(now + readOid4vcClientAttestationTtlMs())
}

function toWalletAttestationRequired(error: unknown): Error {
  if (error instanceof HardwareKeyNotFoundError || error instanceof HardwareEcdsaUnavailableError) {
    return new Error(WALLET_ATTESTATION_REQUIRED)
  }
  return error instanceof Error ? error : new Error(WALLET_ATTESTATION_REQUIRED)
}

function createAttestSignJwtCallback(
  session: HardwareSigningSession,
  publicJwk: EcP256Jwk,
): SignJwtCallback {
  return async (jwtSigner, jwt) => {
    const typ = jwt.header.typ
    if (typ !== CLIENT_ATTESTATION_JWT_TYP && typ !== CLIENT_ATTESTATION_POP_TYP) {
      throw new Error('WalletAttestationRequired: unexpected client attestation JWT type')
    }
    if (jwtSigner.method !== 'jwk') {
      throw new Error('WalletAttestationRequired: client attestation requires a JWK signer')
    }

    const compact = await signEs256Jwt(
      jwt.header as Record<string, unknown>,
      jwt.payload as Record<string, unknown>,
      (data) => session.sign(data),
      typ === CLIENT_ATTESTATION_POP_TYP ? 'client-attestation-pop' : 'client-attestation',
    )
    return { jwt: compact, signerJwk: publicJwk }
  }
}

async function openAttestSigningSession(maxSignatures: number): Promise<{
  session: HardwareSigningSession
  publicJwk: EcP256Jwk
  signJwt: SignJwtCallback
  close: () => Promise<void>
}> {
  let signer
  try {
    signer = getHardwareEcdsaSigner()
  } catch (error) {
    throw toWalletAttestationRequired(error)
  }

  try {
    const hasKey = await signer.hasKey(WALLET_P256_ATTEST_ALIAS)
    if (!hasKey) {
      throw new Error(WALLET_ATTESTATION_REQUIRED)
    }

    const publicJwk = await signer.getPublicJwk(WALLET_P256_ATTEST_ALIAS)
    const session = await signer.openSigningSession(WALLET_P256_ATTEST_ALIAS, {
      purpose: 'attest',
      maxSignatures,
    })
    return {
      session,
      publicJwk,
      signJwt: createAttestSignJwtCallback(session, publicJwk),
      close: () => session.close(),
    }
  } catch (error) {
    if (error instanceof HardwareKeyNotFoundError) {
      throw new Error(WALLET_ATTESTATION_REQUIRED)
    }
    throw error instanceof Error ? error : new Error(WALLET_ATTESTATION_REQUIRED)
  }
}

function createLazyAttestPopSignJwt(): SignJwtCallback {
  return async (jwtSigner, jwt) => {
    const attest = await openAttestSigningSession(1)
    try {
      return await attest.signJwt(jwtSigner, jwt)
    } finally {
      await attest.close()
    }
  }
}

function generateRandomBytes(byteLength: number): Uint8Array {
  return new Uint8Array(randomBytes(byteLength))
}

function wrapTokenClientAuthentication(
  inner: ClientAuthenticationCallback,
): ClientAuthenticationCallback {
  return async (options) => {
    await inner(options)
    if (!isRecord(options.body)) return
    delete options.body.user_pin
    const hasAttestationHeader = Boolean(
      typeof options.headers?.get === 'function'
        ? options.headers.get('OAuth-Client-Attestation')
        : undefined,
    )
    if (hasAttestationHeader) {
      if (!readString(options.body.client_id)) {
        options.body.client_id = WALLET_OAUTH_CLIENT_ID
      }
    } else {
      delete options.body.client_id
      delete options.body.resource
    }
    logWalletStep('oid4vci', 'token-client-auth-applied', {
      bodyKeys: Object.keys(options.body),
      hasAttestationHeader,
    })
  }
}

async function mintOauthClientAttestationJwt(
  publicJwk: EcP256Jwk,
  signJwt: SignJwtCallback,
  expiresAt: Date,
): Promise<string> {
  return createClientAttestationJwt({
    issuedAt: new Date(),
    expiresAt,
    issuer: resolveClientAttestationIssuer(),
    clientId: WALLET_OAUTH_CLIENT_ID,
    confirmation: { jwk: publicJwk },
    signer: {
      method: 'jwk',
      alg: 'ES256',
      publicJwk,
    },
    callbacks: { signJwt },
  })
}

async function resolveMintedTokenClientAuthentication(
  cachedExpiresAtMs: number | undefined,
): Promise<ClientAuthenticationCallback> {
  const maxSignatures = Math.max(2, readDefaultMaxSignatures('attest'))
  const attest = await openAttestSigningSession(maxSignatures)
  try {
    const clientAttestationJwt = await mintOauthClientAttestationJwt(
      attest.publicJwk,
      attest.signJwt,
      resolveMintedAttestationExpiresAt(cachedExpiresAtMs),
    )
    const inner = clientAuthenticationClientAttestationJwt({
      clientAttestationJwt,
      callbacks: {
        signJwt: attest.signJwt,
        generateRandom: async (byteLength) => generateRandomBytes(byteLength),
      },
    })
    const wrapped = wrapTokenClientAuthentication(inner)
    return async (options) => {
      try {
        await wrapped(options)
      } finally {
        await attest.close()
      }
    }
  } catch (error) {
    await attest.close()
    throw error
  }
}

export async function resolveTokenClientAuthentication(
  issuerMetadataResult: Pick<IssuerMetadataResult, 'authorizationServers' | 'credentialIssuer'>,
): Promise<ClientAuthenticationCallback> {
  if (!authorizationServerRequiresClientAttestation(issuerMetadataResult)) {
    return wrapTokenClientAuthentication(clientAuthenticationAnonymous())
  }

  const cached = readCachedFreshWalletUnitAttestation()
  if (cached && isOauthClientAttestationJwt(cached.jwt)) {
    logWalletStep('oid4vci', 'token-client-attestation-using-cached-wua')
    return wrapTokenClientAuthentication(
      clientAuthenticationClientAttestationJwt({
        clientAttestationJwt: cached.jwt,
        callbacks: {
          signJwt: createLazyAttestPopSignJwt(),
          generateRandom: async (byteLength) => generateRandomBytes(byteLength),
        },
      }),
    )
  }

  logWalletStep('oid4vci', 'token-client-attestation-minting', {
    reason: cached ? 'cached-wua-not-oauth-client-attestation' : 'cached-wua-missing',
  })
  return resolveMintedTokenClientAuthentication(cached?.expiresAtMs)
}
