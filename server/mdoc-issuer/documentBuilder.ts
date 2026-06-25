import cbor from 'cbor'
import { createHash, createSign } from 'crypto'

import {
  documentSignerCertificateDer,
  documentSignerPrivateKeyPem,
  issuingAuthorityCertificateDer,
  placeholderDeviceKeyCose,
} from './fixtures'

export type MdocNamespaceClaims = Record<string, string | number | boolean>

export type BuildIssuerSignedMdocInput = {
  docType: string
  namespaces: Record<string, MdocNamespaceClaims>
  issuedAt?: Date
  validUntil?: Date
}

type TaggedValue = InstanceType<typeof cbor.Tagged>

function tagged24(value: Buffer): TaggedValue {
  return new cbor.Tagged(24, value)
}

function dateTag(date: Date): TaggedValue {
  return new cbor.Tagged(0, date.toISOString())
}

function buildIssuerSignedItemBytes(
  namespace: string,
  elementIdentifier: string,
  elementValue: string | number | boolean,
  digestId: number,
): Buffer {
  const random = createHash('sha256')
    .update(`${namespace}:${elementIdentifier}:${digestId}`)
    .digest()
    .subarray(0, 16)

  const item = new Map<string, unknown>([
    ['digestID', digestId],
    ['random', random],
    ['elementIdentifier', elementIdentifier],
    ['elementValue', elementValue],
  ])

  return cbor.encodeCanonical(item)
}

function buildValueDigests(
  namespaces: Record<string, MdocNamespaceClaims>,
): {
  issuerNameSpaces: Map<string, TaggedValue[]>
  valueDigests: Map<string, Map<number, Buffer>>
} {
  const issuerNameSpaces = new Map<string, TaggedValue[]>()
  const valueDigests = new Map<string, Map<number, Buffer>>()

  for (const [namespace, claims] of Object.entries(namespaces)) {
    const taggedItems: TaggedValue[] = []
    const digests = new Map<number, Buffer>()
    let digestId = 0

    for (const [elementIdentifier, elementValue] of Object.entries(claims)) {
      const itemBytes = buildIssuerSignedItemBytes(namespace, elementIdentifier, elementValue, digestId)
      const tagged = tagged24(itemBytes)
      taggedItems.push(tagged)
      digests.set(digestId, createHash('sha256').update(cbor.encodeCanonical(tagged)).digest())
      digestId += 1
    }

    issuerNameSpaces.set(namespace, taggedItems)
    valueDigests.set(namespace, digests)
  }

  return { issuerNameSpaces, valueDigests }
}

function buildMobileSecurityObject(
  docType: string,
  valueDigests: Map<string, Map<number, Buffer>>,
  issuedAt: Date,
  validUntil: Date,
): Buffer {
  const mso = new Map<string, unknown>([
    ['version', '1.0'],
    ['digestAlgorithm', 'SHA-256'],
    ['valueDigests', valueDigests],
    ['deviceKeyInfo', new Map<string, unknown>([['deviceKey', placeholderDeviceKeyCose]])],
    ['docType', docType],
    [
      'validityInfo',
      new Map<string, unknown>([
        ['signed', dateTag(issuedAt)],
        ['validFrom', dateTag(issuedAt)],
        ['validUntil', dateTag(validUntil)],
      ]),
    ],
  ])

  return cbor.encodeCanonical(mso)
}

function signIssuerAuth(payloadTagged: TaggedValue): [Buffer, Map<number, unknown>, TaggedValue, Buffer] {
  const protectedHeaders = new Map<number, number>([[1, -7]])
  const protectedBytes = cbor.encodeCanonical(protectedHeaders)
  const unprotectedHeaders = new Map<number, unknown>([
    [33, [documentSignerCertificateDer, issuingAuthorityCertificateDer]],
  ])

  const sigStructure = cbor.encodeCanonical([
    'Signature1',
    protectedBytes,
    Buffer.alloc(0),
    cbor.encodeCanonical(payloadTagged),
  ])

  const signer = createSign('SHA256')
  signer.update(sigStructure)
  signer.end()

  const signature = signer.sign({
    key: documentSignerPrivateKeyPem,
    dsaEncoding: 'ieee-p1363',
  })

  return [protectedBytes, unprotectedHeaders, payloadTagged, signature]
}

export function buildIssuerSignedMdoc(input: BuildIssuerSignedMdocInput): Buffer {
  const issuedAt = input.issuedAt ?? new Date('2026-06-25T00:00:00.000Z')
  const validUntil = input.validUntil ?? new Date('2031-06-25T00:00:00.000Z')
  const { issuerNameSpaces, valueDigests } = buildValueDigests(input.namespaces)
  const mobileSecurityObjectBytes = buildMobileSecurityObject(input.docType, valueDigests, issuedAt, validUntil)
  const payloadTagged = tagged24(mobileSecurityObjectBytes)
  const issuerAuth = signIssuerAuth(payloadTagged)

  const document = new Map<string, unknown>([
    ['docType', input.docType],
    [
      'issuerSigned',
      new Map<string, unknown>([
        ['nameSpaces', issuerNameSpaces],
        ['issuerAuth', issuerAuth],
      ]),
    ],
  ])

  return cbor.encodeCanonical(document)
}
