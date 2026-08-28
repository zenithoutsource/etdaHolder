import { encode } from 'cbor-x'

import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

import {
  appendDerivedAgeOverRegistryFields,
  buildDcApiRegistryFields,
  DC_API_MDL_DOCTYPE,
  filterDcApiRegistryFieldsForMatcher,
  isDcApiMdocCredential,
  isDcApiRegistryMatchField,
  readDcApiDerivedAgeOverMaxThreshold,
} from './dcApiRegistryFields'

const ISO_NS = 'org.iso.18013.5.1'

function encodeIssuerSignedDocument(claims: Record<string, unknown>): Uint8Array {
  const items = Object.entries(claims).map(([identifier, value], digestID) =>
    new Map<unknown, unknown>([
      ['digestID', digestID],
      ['random', new Uint8Array([digestID + 1])],
      ['elementIdentifier', identifier],
      ['elementValue', value],
    ]),
  )

  return encode(
    new Map<unknown, unknown>([
      ['docType', DC_API_MDL_DOCTYPE],
      [
        'issuerSigned',
        new Map<unknown, unknown>([
          ['nameSpaces', new Map<unknown, unknown>([[ISO_NS, items]])],
        ]),
      ],
    ]),
  )
}

jest.mock('@/src/services/proximity/mdocCredential', () => {
  const actual = jest.requireActual<typeof import('@/src/services/proximity/mdocCredential')>(
    '@/src/services/proximity/mdocCredential',
  )
  return {
    ...actual,
    ensureNativeMdocStored: jest.fn(async () => true),
  }
})

const mdocBytes = encodeIssuerSignedDocument({
  family_name: 'Lovelace',
  given_name: 'Ada',
  birth_date: '1990-01-01',
  document_number: 'DL-DEMO-000001',
  family_name_national_character: 'สุขใจ',
})

const mdlRecord: VerifiableCredentialRecord = {
  id: 'mdl-credential-1',
  type: 'DLTDrivingLicence',
  rawVc: `mdoc:${base64UrlEncodeBytes(mdocBytes)}`,
  claims: { doctype: DC_API_MDL_DOCTYPE },
  issuedAt: '2026-08-24T00:00:00.000Z',
}

describe('dcApiRegistryFields', () => {
  test('isDcApiMdocCredential accepts org.iso.18013.5.1.mDL records', () => {
    expect(isDcApiMdocCredential(mdlRecord)).toBe(true)
  })

  test('buildDcApiRegistryFields registers all scalar ISO namespace claims from mdoc bytes', async () => {
    const fields = await buildDcApiRegistryFields(mdlRecord)

    expect(fields).toEqual(
      expect.arrayContaining([
        {
          namespace: ISO_NS,
          identifier: 'family_name',
          fieldValue: 'Lovelace',
        },
        {
          namespace: ISO_NS,
          identifier: 'given_name',
          fieldValue: 'Ada',
        },
        {
          namespace: ISO_NS,
          identifier: 'birth_date',
          fieldValue: '1990-01-01',
        },
        {
          namespace: ISO_NS,
          identifier: 'document_number',
          fieldValue: 'DL-DEMO-000001',
        },
        {
          namespace: ISO_NS,
          identifier: 'family_name_national_character',
          fieldValue: 'สุขใจ',
        },
      ]),
    )
  })

  test('buildDcApiRegistryFields derives age_over thresholds from birth_date when absent', async () => {
    const record: VerifiableCredentialRecord = {
      ...mdlRecord,
      rawVc: `mdoc:${base64UrlEncodeBytes(
        encodeIssuerSignedDocument({
          family_name: 'Lovelace',
          given_name: 'Ada',
          birth_date: '1990-01-01',
        }),
      )}`,
    }

    const fields = await buildDcApiRegistryFields(record)

    expect(fields.find((field) => field.identifier === 'age_over_18')).toEqual({
      namespace: ISO_NS,
      identifier: 'age_over_18',
      fieldValue: true,
    })
    expect(fields.find((field) => field.identifier === 'age_over_21')).toEqual({
      namespace: ISO_NS,
      identifier: 'age_over_21',
      fieldValue: true,
    })
    expect(fields.find((field) => field.identifier === 'age_over_60')).toEqual({
      namespace: ISO_NS,
      identifier: 'age_over_60',
      fieldValue: false,
    })
  })

  test('appendDerivedAgeOverRegistryFields keeps existing age_over claims and fills missing thresholds', () => {
    const fields = appendDerivedAgeOverRegistryFields(
      [
        {
          namespace: ISO_NS,
          identifier: 'age_over_18',
          fieldValue: true,
        },
        {
          namespace: ISO_NS,
          identifier: 'age_over_21',
          fieldValue: false,
        },
      ],
      { birth_date: '2010-01-01' },
      new Date('2026-08-26T00:00:00.000Z'),
      25,
    )

    expect(fields.find((field) => field.identifier === 'age_over_18')).toEqual({
      namespace: ISO_NS,
      identifier: 'age_over_18',
      fieldValue: true,
    })
    expect(fields.find((field) => field.identifier === 'age_over_21')).toEqual({
      namespace: ISO_NS,
      identifier: 'age_over_21',
      fieldValue: false,
    })
    expect(fields.find((field) => field.identifier === 'age_over_16')).toEqual({
      namespace: ISO_NS,
      identifier: 'age_over_16',
      fieldValue: true,
    })
    expect(fields.some((field) => field.identifier === 'age_over_26')).toBe(false)
  })

  test('readDcApiDerivedAgeOverMaxThreshold defaults to 99 and caps invalid env values', () => {
    const original = process.env.EXPO_PUBLIC_DC_API_DERIVED_AGE_OVER_MAX
    delete process.env.EXPO_PUBLIC_DC_API_DERIVED_AGE_OVER_MAX
    expect(readDcApiDerivedAgeOverMaxThreshold()).toBe(99)

    process.env.EXPO_PUBLIC_DC_API_DERIVED_AGE_OVER_MAX = '60'
    expect(readDcApiDerivedAgeOverMaxThreshold()).toBe(60)

    process.env.EXPO_PUBLIC_DC_API_DERIVED_AGE_OVER_MAX = '0'
    expect(readDcApiDerivedAgeOverMaxThreshold()).toBe(99)

    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_DC_API_DERIVED_AGE_OVER_MAX
    } else {
      process.env.EXPO_PUBLIC_DC_API_DERIVED_AGE_OVER_MAX = original
    }
  })

  test('buildDcApiRegistryFields serializes CBOR Date and tagged birth_date values', async () => {
    const taggedRecord: VerifiableCredentialRecord = {
      ...mdlRecord,
      rawVc: `mdoc:${base64UrlEncodeBytes(
        encodeIssuerSignedDocument({
          family_name: 'Lovelace',
          given_name: 'Ada',
          birth_date: { tag: 1004, value: '1990-01-01' },
        }),
      )}`,
    }
    const dateRecord: VerifiableCredentialRecord = {
      ...mdlRecord,
      rawVc: `mdoc:${base64UrlEncodeBytes(
        encodeIssuerSignedDocument({
          family_name: 'Lovelace',
          given_name: 'Ada',
          birth_date: new Date('1988-06-15T00:00:00.000Z'),
        }),
      )}`,
    }

    await expect(buildDcApiRegistryFields(taggedRecord)).resolves.toEqual(
      expect.arrayContaining([
        {
          namespace: ISO_NS,
          identifier: 'birth_date',
          fieldValue: '1990-01-01',
        },
        {
          namespace: ISO_NS,
          identifier: 'age_over_18',
          fieldValue: true,
        },
        {
          namespace: ISO_NS,
          identifier: 'age_over_21',
          fieldValue: true,
        },
      ]),
    )
    await expect(buildDcApiRegistryFields(dateRecord)).resolves.toEqual(
      expect.arrayContaining([
        {
          namespace: ISO_NS,
          identifier: 'birth_date',
          fieldValue: '1988-06-15',
        },
      ]),
    )
  })

  test('buildDcApiRegistryFields registers portrait as a presence-only matcher path', async () => {
    const record: VerifiableCredentialRecord = {
      ...mdlRecord,
      rawVc: `mdoc:${base64UrlEncodeBytes(
        encodeIssuerSignedDocument({
          family_name: 'Lovelace',
          given_name: 'Ada',
          birth_date: '1990-01-01',
          portrait: Uint8Array.from([0x01, 0x02, 0x03]),
        }),
      )}`,
    }

    const fields = await buildDcApiRegistryFields(record)

    expect(fields).toEqual(
      expect.arrayContaining([
        {
          namespace: ISO_NS,
          identifier: 'portrait',
          fieldValue: null,
        },
      ]),
    )
  })

  test('filterDcApiRegistryFieldsForMatcher keeps every match-safe scalar field', () => {
    const fields = filterDcApiRegistryFieldsForMatcher([
      {
        namespace: ISO_NS,
        identifier: 'family_name',
        fieldValue: 'Lovelace',
      },
      {
        namespace: ISO_NS,
        identifier: 'document_number',
        fieldValue: 'ABC123',
      },
      {
        namespace: ISO_NS,
        identifier: 'given_name',
        fieldValue: 'Ada',
      },
      {
        namespace: ISO_NS,
        identifier: 'portrait',
        fieldValue: null,
      },
      {
        namespace: ISO_NS,
        identifier: 'driving_privileges',
        fieldValue: null,
      },
    ])

    expect(fields.map((field) => field.identifier)).toEqual([
      'family_name',
      'document_number',
      'given_name',
      'portrait',
    ])
  })

  test('buildDcApiRegistryFields omits binary ISO fields from matcher metadata except portrait', async () => {
    const portraitBytes = Uint8Array.from([0x01, 0x02, 0x03])
    const record: VerifiableCredentialRecord = {
      ...mdlRecord,
      rawVc: `mdoc:${base64UrlEncodeBytes(
        encodeIssuerSignedDocument({
          family_name: 'Lovelace',
          given_name: 'Ada',
          birth_date: '1990-01-01',
          portrait: portraitBytes,
        }),
      )}`,
    }

    const fields = await buildDcApiRegistryFields(record)
    const identifiers = fields.map((field) => field.identifier)

    expect(identifiers).toEqual(
      expect.arrayContaining(['family_name', 'given_name', 'birth_date', 'age_over_18', 'age_over_21', 'portrait']),
    )
    expect(identifiers.some((identifier) => identifier.startsWith('__b64__'))).toBe(false)
  })

  test('isDcApiRegistryMatchField keeps portrait as a presence-only matcher path', () => {
    expect(
      isDcApiRegistryMatchField({
        namespace: ISO_NS,
        identifier: 'portrait',
        fieldValue: null,
      }),
    ).toBe(true)
    expect(
      isDcApiRegistryMatchField({
        namespace: ISO_NS,
        identifier: 'portrait',
        fieldValue: '__b64__:AQID',
      }),
    ).toBe(true)
  })

  test('serializeRegistryFieldValue still maps binary ISO values to placeholders for other callers', async () => {
    const portraitBytes = Uint8Array.from([0x01, 0x02, 0x03])
    const record: VerifiableCredentialRecord = {
      ...mdlRecord,
      rawVc: `mdoc:${base64UrlEncodeBytes(
        encodeIssuerSignedDocument({
          family_name: 'Lovelace',
          portrait: portraitBytes,
        }),
      )}`,
    }

    const fields = await buildDcApiRegistryFields(record)

    expect(fields.some((field) => field.identifier === 'portrait' && field.fieldValue === null)).toBe(
      true,
    )
    expect(fields.some((field) => field.identifier === 'family_name')).toBe(true)
  })
})
