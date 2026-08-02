import {
  decodeJwtHeader,
  decodeJwtPayload,
  readString,
} from '@/src/utils/jwtUtils'
import { logWalletStep } from '../debug/walletLogger'
import { verifyEdDsaCompactJwt } from '../crypto/eddsaJwtVerify'
import { resolveDidKeyPublicJwk, readIssuerResolveBaseUrls } from '../vp/resolveDidKeyViaIssuer'
import { resolveDidWebVerificationJwk } from '../vp/didWebResolver'

export type AssertIssuerDidWebOptions = {
  fetchImpl?: typeof fetch
  issuerBaseUrl?: string
  issuerMetadata?: Record<string, unknown>
}

/**
 * P2 steps 29–31 (partial): verify Issuer JWT EdDSA signature after resolving
 * the signing key from `did:web` DID documents or Issuer `GET /resolveDID` when
 * the JWT header `kid` is `did:key:…`. Trust Registry accreditation is still
 * out of scope until a registry API exists.
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
  const fetchImpl = options.fetchImpl ?? fetch

  if (iss.startsWith('did:web:')) {
    logWalletStep('oid4vci', 'issuer-did-web-resolve-start', { iss })
    const publicJwk = await resolveDidWebVerificationJwk(iss, kid, fetchImpl)
    logWalletStep('oid4vci', 'issuer-did-web-resolve-complete', { iss })

    if (!verifyEdDsaCompactJwt(issuerJwt, publicJwk)) {
      throw new Error(
        'CredentialIssuerSignatureInvalid: issuer JWT signature does not match did:web public key',
      )
    }

    logWalletStep('oid4vci', 'issuer-did-web-signature-verified', { iss })
    return
  }

  if (kid?.startsWith('did:key:')) {
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

    if (!verifyEdDsaCompactJwt(issuerJwt, publicJwk)) {
      throw new Error(
        'CredentialIssuerSignatureInvalid: issuer JWT signature does not match resolveDID public key',
      )
    }

    logWalletStep('oid4vci', 'issuer-resolve-did-signature-verified', { iss })
    return
  }

  logWalletStep('oid4vci', 'issuer-did-web-resolve-skipped', {
    reason: 'iss-not-did-web',
    issScheme: iss.split(':')[0] ?? 'unknown',
  })
}

function readIssuerJwt(rawVc: string): string {
  if (rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3) {
    return rawVc.split('~')[0] ?? rawVc
  }
  return rawVc
}
