import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { isMdocRawVc, readMdocBytesFromRawVc } from '../proximity/mdocCredential'
import { readStoredMdocBytes } from '../proximity/mdocStorage'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

/**
 * Builds the mso_mdoc VP Token entry for DCQL responses.
 * Interim v1: base64url-encoded stored mDOC issuer payload until native DeviceResponse builder lands (ADR 0006).
 */
export async function readMdocVpTokenEntry(credentialId: string, rawVc?: string): Promise<string> {
  const mdocBytes = await readMdocBytesForVpToken(credentialId, rawVc)
  const encoded = base64UrlEncodeBytes(mdocBytes)
  logWalletStep('oid4vp', 'mdoc-vp-token-entry-built', {
    credentialId,
    mdocBytes: mdocBytes.length,
    encodedBytes: encoded.length,
  })
  return encoded
}

async function readMdocBytesForVpToken(credentialId: string, rawVc?: string): Promise<Uint8Array> {
  try {
    return await readStoredMdocBytes(credentialId)
  } catch (error) {
    if (isMdocRawVc(rawVc)) {
      logWalletStep('oid4vp', 'mdoc-vp-token-entry-rawvc-fallback', { credentialId })
      return readMdocBytesFromRawVc(rawVc)
    }
    logWalletError('oid4vp', 'mdoc-vp-token-entry-failed', error, { credentialId })
    throw error
  }
}
