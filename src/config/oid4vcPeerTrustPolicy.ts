import { readWalletDemoInteropEnabled } from './runtimeFlags'
import { isIssuerOid4VpClientId } from './trustedVerifiers'

/**
 * Testing-period interop: trust unlisted HTTPS OID4VCI/OID4VP peers.
 * Default off. Production customer builds must leave these unset/false.
 *
 * EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER=true enables both issuer and verifier paths.
 * EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER / _VERIFIER toggle each side independently.
 */
export function readTrustAnyOid4vcIssuerEnabled(): boolean {
  if (readWalletDemoInteropEnabled()) return true

  return (
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER === 'true' ||
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER === 'true'
  )
}

export function readTrustAnyOid4vcVerifierEnabled(): boolean {
  if (readWalletDemoInteropEnabled()) return true

  return (
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER === 'true' ||
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER === 'true'
  )
}

/** @deprecated Prefer readTrustAnyOid4vcIssuerEnabled / readTrustAnyOid4vcVerifierEnabled. */
export function readTrustAnyOid4vcPeerEnabled(): boolean {
  return process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER === 'true'
}

export function readTrustAnyOid4vcPeerForClientId(clientId: string): boolean {
  return isIssuerOid4VpClientId(clientId)
    ? readTrustAnyOid4vcIssuerEnabled()
    : readTrustAnyOid4vcVerifierEnabled()
}
