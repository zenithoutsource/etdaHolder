import { logWalletRawProtocol } from '../debug/walletLogger'

/** Form body for OID4VP direct_post / direct_post.jwt presentation submit. */
export function isOid4vpPresentationWireBody(body: string | undefined): boolean {
  if (!body) return false
  return body.startsWith('response=') || body.includes('vp_token=')
}

/** Single raw-protocol log for outbound presentation: semantic vp_token plus wire form body. */
export function logOid4vpRawPresentationSubmit(input: {
  responseUri: string
  responseMode: string
  vpToken: string
  wireBody: string
}): void {
  logWalletRawProtocol('oid4vp', 'debug-raw-presentation-submit', input)
}
