import { isTrustedIssuerJwtAlg } from '@/src/config/issuerJwtVerifyPolicy'
import {
  decodeJwtHeader,
  decodeJwtPayload,
  isSameJwk,
  readString,
} from '@/src/utils/jwtUtils'
import { logWalletStep } from '../debug/walletLogger'
import { verifyEdDsaCompactJwt } from '../crypto/eddsaJwtVerify'
import { verifyEs256CompactJwt } from '../crypto/es256JwtVerify'
import { didKeyToP256PublicJwk } from '../crypto/p256Identity'
import {
  resolveDidKeyP256PublicJwk,
  resolveDidKeyPublicJwk,
  readIssuerResolveBaseUrls,
} from '../vp/resolveDidKeyViaIssuer'
import { resolveDidWebVerificationJwk } from '../vp/didWebResolver'

export type AssertIssuerDidWebOptions = {
  fetchImpl?: typeof fetch
  issuerBaseUrl?: string
  issuerMetadata?: Record<string, unknown>
}

/**
 * P2 canvas 31: verify Issuer JWT signature after resolving the signing key from
 * `did:web` DID documents or Issuer `GET /resolveDID` when `kid` is `did:key:…`.
 * ES256 HTTPS `did:key` kids are bound to the issuer-resolved P-256 JWK (no
 * local-only trust). Trusted algs are ES256 and EdDSA (holder signing is
 * independent). Trust Registry accreditation is still out of scope until a
 * registry API exists.
 */
export async function assertIssuerDidWebCredentialSignature(
  rawVc: string,
  options: AssertIssuerDidWebOptions = {},
): Promise<void> {
  if (rawVc.startsWith('mdoc:')) {
    logWalletStep('oid4vci', 'issuer-did-web-resolve-skipped', { reason: 'mdoc' })
    return
  }

  const issuerJwt = readIssuerJwt(rawVc)
  const payload = decodeJwtPayload(issuerJwt)
  const iss = readString(payload?.iss)

  if (!iss) {
    logWalletStep('oid4vci', 'issuer-did-web-resolve-skipped', { reason: 'iss-missing' })
    return
  }

  const header = decodeJwtHeader(issuerJwt)
  const kid = readString(header?.kid)
  const alg = readString(header?.alg)
  const fetchImpl = options.fetchImpl ?? fetch

  if (iss.startsWith('did:web:')) {
    assertTrustedIssuerJwtAlg(alg)
    logWalletStep('oid4vci', 'issuer-did-web-resolve-start', { iss, alg })
    const publicJwk = await resolveDidWebVerificationJwk(iss, kid, fetchImpl)
    logWalletStep('oid4vci', 'issuer-did-web-resolve-complete', { iss })
    assertIssuerJwtMatchesKey(
      issuerJwt,
      publicJwk,
      alg,
      'CredentialIssuerSignatureInvalid: issuer JWT signature does not match did:web public key',
    )
    logWalletStep('oid4vci', 'issuer-did-web-signature-verified', { iss, alg })
    return
  }

  if (kid?.startsWith('did:key:')) {
    assertTrustedIssuerJwtAlg(alg)

    if (alg === 'ES256') {
      const issuerUrls = readIssuerResolveBaseUrls(
        iss,
        options.issuerBaseUrl,
        options.issuerMetadata,
      )
      logWalletStep('oid4vci', 'issuer-resolve-did-start', {
        iss,
        issuerUrlCount: issuerUrls.length,
      })
      const publicJwk = await resolveDidKeyP256PublicJwk(kid, {
        fetchImpl,
        issuerUrls,
      })
      const kidJwk = decodeP256DidKeyOrThrow(kid)
      if (!isSameJwk(publicJwk, kidJwk)) {
        throw new Error(
          'CredentialIssuerSignatureInvalid: resolveDID P-256 JWK does not match did:key kid',
        )
      }
      logWalletStep('oid4vci', 'issuer-resolve-did-complete', { iss })
      assertIssuerJwtMatchesKey(
        issuerJwt,
        publicJwk,
        alg,
        'CredentialIssuerSignatureInvalid: issuer JWT signature does not match resolveDID public key',
      )
      logWalletStep('oid4vci', 'issuer-resolve-did-signature-verified', { iss, alg })
      return
    }

    const issuerUrls = readIssuerResolveBaseUrls(
      iss,
      options.issuerBaseUrl,
      options.issuerMetadata,
    )
    logWalletStep('oid4vci', 'issuer-resolve-did-start', {
      iss,
      issuerUrlCount: issuerUrls.length,
    })
    const publicJwk = await resolveDidKeyPublicJwk(kid, {
      fetchImpl,
      issuerUrls,
    })
    logWalletStep('oid4vci', 'issuer-resolve-did-complete', { iss })
    assertIssuerJwtMatchesKey(
      issuerJwt,
      publicJwk,
      alg,
      'CredentialIssuerSignatureInvalid: issuer JWT signature does not match resolveDID public key',
    )
    logWalletStep('oid4vci', 'issuer-resolve-did-signature-verified', { iss, alg })
    return
  }

  if (iss.startsWith('https:') || iss.startsWith('http:')) {
    assertTrustedIssuerJwtAlg(alg)
    throw new Error(
      'CredentialIssuerSignatureInvalid: HTTPS issuer JWT requires a did:key kid or did:web iss',
    )
  }

  logWalletStep('oid4vci', 'issuer-did-web-resolve-skipped', {
    reason: 'iss-not-did-web',
    issScheme: iss.split(':')[0] ?? 'unknown',
  })
}

function assertTrustedIssuerJwtAlg(alg: string | undefined): asserts alg is 'ES256' | 'EdDSA' {
  if (!isTrustedIssuerJwtAlg(alg)) {
    throw new Error(
      `CredentialSignatureAlgUnsupported: issuer credential alg must be ES256 or EdDSA, got ${alg ?? 'missing'}`,
    )
  }
}

function assertIssuerJwtMatchesKey(
  issuerJwt: string,
  publicJwk: Record<string, unknown>,
  alg: 'ES256' | 'EdDSA',
  invalidMessage: string,
): void {
  const verified =
    alg === 'ES256'
      ? verifyEs256CompactJwt(issuerJwt, publicJwk)
      : verifyEdDsaCompactJwt(issuerJwt, publicJwk)
  if (!verified) {
    throw new Error(invalidMessage)
  }
}

function decodeP256DidKeyOrThrow(kid: string): Record<string, unknown> {
  try {
    return didKeyToP256PublicJwk(kid)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `CredentialIssuerSignatureInvalid: ES256 did:key could not be decoded (${detail})`,
    )
  }
}

function readIssuerJwt(rawVc: string): string {
  if (rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3) {
    return rawVc.split('~')[0] ?? rawVc
  }
  return rawVc
}
