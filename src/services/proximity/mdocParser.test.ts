import { encode, decode } from 'cbor-x'

import { parseMdocDocument, listMdocFieldKeys, formatMdocFieldLabel, readMdocIssuerAuthSignatureBase64Url } from './mdocParser'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

const ISO_NS = 'org.iso.18013.5.1'
const DOC_TYPE = 'org.iso.18013.5.1.mDL'

function issuerSignedItem(identifier: string, value: unknown): Map<unknown, unknown> {
  return new Map<unknown, unknown>([
    ['digestID', 1],
    ['random', new Uint8Array([1, 2, 3])],
    ['elementIdentifier', identifier],
    ['elementValue', value],
  ])
}

function nameSpacesWithItems(items: Map<unknown, unknown>[]): Map<unknown, unknown> {
  return new Map<unknown, unknown>([[ISO_NS, items]])
}

describe('mdocParser', () => {
  it('parses issuer-signed namespaces from a decoded CBOR map', () => {
    const document = new Map<unknown, unknown>([
      ['docType', DOC_TYPE],
      [
        'issuerSigned',
        new Map<unknown, unknown>([
          [
            'nameSpaces',
            new Map<unknown, unknown>([
              [
                ISO_NS,
                [
                  new Map<unknown, unknown>([
                    ['namespace', ISO_NS],
                    ['elementIdentifier', 'family_name'],
                    ['elementValue', 'Doe'],
                  ]),
                ],
              ],
            ]),
          ],
        ]),
      ],
    ])

    const parsed = parseMdocDocument(new Uint8Array([1]), () => document)
    expect(parsed.docType).toBe(DOC_TYPE)
    expect(parsed.namespaces[ISO_NS].family_name).toBe('Doe')
    expect(listMdocFieldKeys(parsed.namespaces)).toEqual(['org.iso.18013.5.1.family_name'])
    expect(formatMdocFieldLabel('org.iso.18013.5.1.family_name')).toBe('Family Name')
  })

  it('uses the NameSpaces map key when the item has no namespace field', () => {
    const document = new Map<unknown, unknown>([
      ['docType', DOC_TYPE],
      [
        'issuerSigned',
        new Map<unknown, unknown>([
          ['nameSpaces', nameSpacesWithItems([issuerSignedItem('given_name', 'Ada')])],
        ]),
      ],
    ])

    const parsed = parseMdocDocument(new Uint8Array([1]), () => document)
    expect(parsed.namespaces[ISO_NS].given_name).toBe('Ada')
  })

  it('unwraps DeviceResponse documents[]', () => {
    const issuerSigned = new Map<unknown, unknown>([
      ['nameSpaces', nameSpacesWithItems([issuerSignedItem('family_name', 'ใจดี')])],
    ])
    const deviceResponse = new Map<unknown, unknown>([
      ['version', '1.0'],
      [
        'documents',
        [
          new Map<unknown, unknown>([
            ['docType', DOC_TYPE],
            ['issuerSigned', issuerSigned],
          ]),
        ],
      ],
    ])

    const parsed = parseMdocDocument(new Uint8Array([1]), () => deviceResponse)
    expect(parsed.docType).toBe(DOC_TYPE)
    expect(parsed.namespaces[ISO_NS].family_name).toBe('ใจดี')
  })

  it('parses issuerSigned-as-root when nameSpaces sit next to issuerAuth', () => {
    const root = new Map<unknown, unknown>([
      ['issuerAuth', new Uint8Array([0xd2])],
      ['nameSpaces', nameSpacesWithItems([issuerSignedItem('document_number', '123456789')])],
    ])

    const parsed = parseMdocDocument(new Uint8Array([1]), () => root)
    expect(parsed.docType).toBe(DOC_TYPE)
    expect(parsed.namespaces[ISO_NS].document_number).toBe('123456789')
  })

  it('decodes CBOR tag 24 IssuerSignedItem bytes', () => {
    const itemBytes = new Uint8Array([0x24])
    const itemMap = issuerSignedItem('birth_date', '1985-01-01')
    const document = new Map<unknown, unknown>([
      ['docType', DOC_TYPE],
      [
        'issuerSigned',
        new Map<unknown, unknown>([
          ['nameSpaces', nameSpacesWithItems([{ tag: 24, value: itemBytes } as unknown as Map<unknown, unknown>])],
        ]),
      ],
    ])

    const parsed = parseMdocDocument(new Uint8Array([1]), (input) => {
      if (input === itemBytes) return itemMap
      return document
    })
    expect(parsed.namespaces[ISO_NS].birth_date).toBe('1985-01-01')
  })

  it('keeps structured driving_privileges element values', () => {
    const privileges = [
      new Map<unknown, unknown>([['vehicle_category_code', 'A']]),
      new Map<unknown, unknown>([['vehicle_category_code', 'B']]),
    ]
    const document = new Map<unknown, unknown>([
      ['docType', DOC_TYPE],
      [
        'issuerSigned',
        new Map<unknown, unknown>([
          ['nameSpaces', nameSpacesWithItems([issuerSignedItem('driving_privileges', privileges)])],
        ]),
      ],
    ])

    const parsed = parseMdocDocument(new Uint8Array([1]), () => document)
    expect(parsed.namespaces[ISO_NS].driving_privileges).toEqual(privileges)
  })

  it('infers EUDI PID docType from a single eu.europa namespace when docType is absent', () => {
    const eudiNamespace = 'eu.europa.ec.eudi.pid.1'
    const root = new Map<unknown, unknown>([
      ['issuerAuth', new Uint8Array([0xd2])],
      [
        'nameSpaces',
        new Map<unknown, unknown>([
          [eudiNamespace, [issuerSignedItem('family_name', 'Mustermann')]],
        ]),
      ],
    ])

    const parsed = parseMdocDocument(new Uint8Array([1]), () => root)
    expect(parsed.docType).toBe(eudiNamespace)
    expect(parsed.namespaces[eudiNamespace].family_name).toBe('Mustermann')
  })

  it('reads issuerAuth COSE_Sign1 signature bytes as base64url', () => {
    const signatureBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const issuerAuth = {
      tag: 18,
      value: [new Uint8Array([0xa0]), new Map(), new Uint8Array([0xa0]), signatureBytes],
    }
    const document = new Map<unknown, unknown>([
      ['docType', DOC_TYPE],
      [
        'issuerSigned',
        new Map<unknown, unknown>([
          ['nameSpaces', nameSpacesWithItems([issuerSignedItem('given_name', 'Ada')])],
          ['issuerAuth', issuerAuth],
        ]),
      ],
    ])
    const bytes = encode(document)

    expect(readMdocIssuerAuthSignatureBase64Url(bytes, decode)).toBe(
      base64UrlEncodeBytes(signatureBytes),
    )
  })
})
