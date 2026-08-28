import { decode as decodeCbor } from 'cbor-x'

import { base64UrlToBytes } from '@/src/utils/jwtUtils'
import { isMdocRawVc } from '../proximity/mdocCredential'
import { readMdocIssuerAuthSignatureBase64Url } from '../proximity/mdocParser'

const MDOC_RAW_PREFIX = 'mdoc:'

export function readCompactTokenSignature(token: string): string | undefined {
  const jwt = token.split('~').find((segment) => segment.split('.').length >= 3)
  const signature = jwt?.split('.')[2]
  return signature && signature.length > 0 ? signature : undefined
}

/** Issuer signature for display on approval / PoP evidence cards (JWT, SD-JWT, or mdoc COSE). */
export function readCredentialPresentationSignature(rawVc: string): string | undefined {
  if (isMdocRawVc(rawVc)) {
    const mdocBytes = base64UrlToBytes(rawVc.slice(MDOC_RAW_PREFIX.length))
    return readMdocIssuerAuthSignatureBase64Url(mdocBytes, decodeCbor)
  }

  return readCompactTokenSignature(rawVc)
}
