import { encode } from 'cbor-x'

import { base64UrlEncodeBytes } from '@/src/utils/base64Url'
import { readCompactTokenSignature, readCredentialPresentationSignature } from './presentationEvidence'

const ISO_NS = 'org.iso.18013.5.1'
const DOC_TYPE = 'org.iso.18013.5.1.mDL'

function encodeMdocWithIssuerAuthSignature(signatureBytes: Uint8Array): string {
  const issuerSignedItem = new Map<unknown, unknown>([
    ['digestID', 0],
    ['random', new Uint8Array([1])],
    ['elementIdentifier', 'given_name'],
    ['elementValue', 'Ada'],
  ])
  const document = new Map<unknown, unknown>([
    ['docType', DOC_TYPE],
    [
      'issuerSigned',
      new Map<unknown, unknown>([
        ['nameSpaces', new Map<unknown, unknown>([[ISO_NS, [issuerSignedItem]]])],
        [
          'issuerAuth',
          {
            tag: 18,
            value: [new Uint8Array([0xa0]), new Map(), new Uint8Array([0xa0]), signatureBytes],
          },
        ],
      ]),
    ],
  ])
  return `mdoc:${base64UrlEncodeBytes(encode(document))}`
}

describe('presentationEvidence', () => {
  test('extracts the signature from a compact JWT', () => {
    expect(readCompactTokenSignature('header.payload.real-signature')).toBe('real-signature')
  })

  test('extracts the issuer JWT signature from a compact SD-JWT', () => {
    expect(readCompactTokenSignature('header.payload.sd-jwt-signature~disclosure~')).toBe('sd-jwt-signature')
  })

  test('returns undefined when no compact signature is available', () => {
    expect(readCompactTokenSignature('nonce-123')).toBeUndefined()
  })

  test('reads mdoc issuerAuth COSE signature for presentation evidence', () => {
    const signatureBytes = new Uint8Array([0x11, 0x22, 0x33, 0x44])
    const rawVc = encodeMdocWithIssuerAuthSignature(signatureBytes)

    expect(readCredentialPresentationSignature(rawVc)).toBe(base64UrlEncodeBytes(signatureBytes))
  })
})
