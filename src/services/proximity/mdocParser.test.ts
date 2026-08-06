import { parseMdocDocument, listMdocFieldKeys, formatMdocFieldLabel } from './mdocParser'

describe('mdocParser', () => {
  it('parses issuer-signed namespaces from a decoded CBOR map', () => {
    const document = new Map<unknown, unknown>([
      ['docType', 'org.iso.18013.5.1.mDL'],
      [
        'issuerSigned',
        new Map<unknown, unknown>([
          [
            'nameSpaces',
            new Map<unknown, unknown>([
              [
                'org.iso.18013.5.1',
                [
                  new Map<unknown, unknown>([
                    ['namespace', 'org.iso.18013.5.1'],
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
    expect(parsed.docType).toBe('org.iso.18013.5.1.mDL')
    expect(parsed.namespaces['org.iso.18013.5.1'].family_name).toBe('Doe')
    expect(listMdocFieldKeys(parsed.namespaces)).toEqual(['org.iso.18013.5.1.family_name'])
    expect(formatMdocFieldLabel('org.iso.18013.5.1.family_name')).toBe('Family Name')
  })
})
