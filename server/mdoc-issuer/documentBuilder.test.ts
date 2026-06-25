import cbor from 'cbor'
import { createHash, createVerify, X509Certificate } from 'crypto'

import { buildIssuerSignedMdoc } from './documentBuilder'
import { documentSignerCertificatePem } from './fixtures'

function expectTagged24(value: unknown): Buffer {
  expect(value).toBeInstanceOf(cbor.Tagged)
  const tagged = value as cbor.Tagged
  expect(tagged.tag).toBe(24)
  return tagged.value as Buffer
}

function readObjectField<T>(value: unknown, field: string): T {
  return (value as Record<string, T>)[field]
}

function readNumericField<T>(value: unknown, field: number): T {
  if (value instanceof Map) {
    return value.get(field) as T
  }

  return (value as Record<string, T>)[String(field)]
}

describe('buildIssuerSignedMdoc', () => {
  it('builds an issuer-signed mdoc with namespaces, MSO digests, and issuer auth', () => {
    const credential = buildIssuerSignedMdoc({
      docType: 'org.iso.18013.5.1.mDL',
      namespaces: {
        'org.iso.18013.5.1': {
          family_name: 'Developer',
          given_name: 'ETDA',
          document_number: 'TH-123456',
        },
      },
    })

    const document = cbor.decodeFirstSync(credential) as Record<string, unknown>
    expect(document.docType).toBe('org.iso.18013.5.1.mDL')

    const issuerSigned = readObjectField<Record<string, unknown>>(document, 'issuerSigned')
    const nameSpaces = readObjectField<Record<string, unknown>>(issuerSigned, 'nameSpaces')
    const issuerSignedItems = readObjectField<unknown[]>(nameSpaces, 'org.iso.18013.5.1')
    expect(issuerSignedItems).toHaveLength(3)

    const issuerAuth = readObjectField<unknown[]>(issuerSigned, 'issuerAuth')
    expect(Array.isArray(issuerAuth)).toBe(true)
    expect(issuerAuth).toHaveLength(4)

    const protectedHeader = cbor.decodeFirstSync(issuerAuth[0] as Buffer)
    expect(readNumericField<number>(protectedHeader, 1)).toBe(-7)

    const unprotectedHeader = issuerAuth[1]
    expect(readNumericField<unknown[]>(unprotectedHeader, 33)).toEqual(expect.any(Array))

    const payloadBytes = expectTagged24(issuerAuth[2])
    const mobileSecurityObject = cbor.decodeFirstSync(payloadBytes) as Record<string, unknown>
    expect(mobileSecurityObject.version).toBe('1.0')
    expect(mobileSecurityObject.digestAlgorithm).toBe('SHA-256')
    expect(mobileSecurityObject.docType).toBe('org.iso.18013.5.1.mDL')

    const valueDigests = readObjectField<Record<string, unknown>>(mobileSecurityObject, 'valueDigests')
    const namespaceDigests = readObjectField<Record<string, Buffer> | Map<number, Buffer>>(valueDigests, 'org.iso.18013.5.1')
    expect(namespaceDigests instanceof Map ? namespaceDigests.size : Object.keys(namespaceDigests).length).toBe(3)

    issuerSignedItems.forEach((taggedItem) => {
      const itemBytes = expectTagged24(taggedItem)
      const item = cbor.decodeFirstSync(itemBytes) as Record<string, unknown>
      const digestId = item.digestID as number
      const digest = createHash('sha256').update(itemBytes).digest()
      expect(readNumericField<Buffer>(namespaceDigests, digestId)).toEqual(digest)
    })
  })

  it('signs issuer auth with the document signer certificate public key', () => {
    const credential = buildIssuerSignedMdoc({
      docType: 'org.iso.18013.5.1.mDL',
      namespaces: {
        'org.iso.18013.5.1': {
          family_name: 'Developer',
        },
      },
    })

    const document = cbor.decodeFirstSync(credential) as Record<string, unknown>
    const issuerSigned = readObjectField<Record<string, unknown>>(document, 'issuerSigned')
    const issuerAuth = readObjectField<[Buffer, Record<string, unknown>, cbor.Tagged, Buffer]>(issuerSigned, 'issuerAuth')

    const protectedBytes = issuerAuth[0]
    const payloadTagged = issuerAuth[2]
    const signature = issuerAuth[3]

    const sigStructure = cbor.encodeCanonical([
      'Signature1',
      protectedBytes,
      Buffer.alloc(0),
      cbor.encodeCanonical(payloadTagged),
    ])

    const verifier = createVerify('SHA256')
    verifier.update(sigStructure)
    verifier.end()

    const certificate = new X509Certificate(documentSignerCertificatePem)
    expect(
      verifier.verify(
        { key: certificate.publicKey, dsaEncoding: 'ieee-p1363' },
        signature,
      ),
    ).toBe(true)
  })
})
