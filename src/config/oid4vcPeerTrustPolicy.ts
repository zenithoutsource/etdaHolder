/**
 * Testing-period interop: trust unlisted HTTPS OID4VCI/OID4VP peers.
 * Default off. Production customer builds must leave this unset/false.
 */
export function readTrustAnyOid4vcPeerEnabled(): boolean {
  return process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER === 'true'
}
