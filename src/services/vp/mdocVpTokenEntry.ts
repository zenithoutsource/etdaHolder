import { logWalletStep } from '../debug/walletLogger'
import { readStoredMdocBytes } from '../proximity/mdocStorage'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

/**
 * Builds the mso_mdoc VP Token entry for DCQL responses.
 * Interim v1: base64url-encoded stored mDOC issuer payload until native DeviceResponse builder lands (ADR 0006).
 */
export async function readMdocVpTokenEntry(credentialId: string): Promise<string> {
  const mdocBytes = await readStoredMdocBytes(credentialId)
  const encoded = base64UrlEncodeBytes(mdocBytes)
  logWalletStep('oid4vp', 'mdoc-vp-token-entry-built', {
    credentialId,
    mdocBytes: mdocBytes.length,
    encodedBytes: encoded.length,
  })
  return encoded
}
