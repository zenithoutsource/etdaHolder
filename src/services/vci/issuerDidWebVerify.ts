import {
  decodeJwtHeader,
  decodeJwtPayload,
  readString,
} from '@/src/utils/jwtUtils'
import { logWalletStep } from '../debug/walletLogger'
import { verifyEdDsaCompactJwt } from '../crypto/eddsaJwtVerify'
import { resolveDidWebVerificationJwk } from '../vp/didWebResolver'

export type AssertIssuerDidWebOptions = {
  fetchImpl?: typeof fetch
}

/**
 * P2 steps 29–31 (partial): when the credential `iss` is `did:web:…`, resolve
 * the Issuer DID document and verify the Issuer JWT EdDSA signature.
 *
 * HTTPS / non-did:web `iss` values skip DID resolve (common OID4VCI HTTPS
 * issuers) — alg checks remain elsewhere. Trust Registry accreditation is
 * still out of scope until a registry API exists.
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

  if (!iss.startsWith('did:web:')) {
    logWalletStep('oid4vci', 'issuer-did-web-resolve-skipped', {
      reason: 'iss-not-did-web',
      issScheme: iss.split(':')[0] ?? 'unknown',
    })
    return
  }

  const header = decodeJwtHeader(issuerJwt)
  const kid = readString(header?.kid)
  const fetchImpl = options.fetchImpl ?? fetch

  logWalletStep('oid4vci', 'issuer-did-web-resolve-start', { iss })
  const publicJwk = await resolveDidWebVerificationJwk(iss, kid, fetchImpl)
  logWalletStep('oid4vci', 'issuer-did-web-resolve-complete', { iss })

  if (!verifyEdDsaCompactJwt(issuerJwt, publicJwk)) {
    throw new Error(
      'CredentialIssuerSignatureInvalid: issuer JWT signature does not match did:web public key',
    )
  }

  logWalletStep('oid4vci', 'issuer-did-web-signature-verified', { iss })
}

function readIssuerJwt(rawVc: string): string {
  if (rawVc.includes('~') && rawVc.split('~')[0]?.split('.').length === 3) {
    return rawVc.split('~')[0] ?? rawVc
  }
  return rawVc
}
