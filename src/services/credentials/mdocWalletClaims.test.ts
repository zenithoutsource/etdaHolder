import { encode } from 'cbor-x'

import { base64UrlEncodeBytes } from '@/src/utils/base64Url'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  extractMdocIssuerClaims,
  extractMdocWalletClaims,
  mapIso18013NamespaceClaims,
  mapMdocNamespaceIssuerClaims,
  overlayDrivingLicenceMdocClaims,
  readDrivingPrivilegeDisplayValue,
  readMdocPhotoClaimValue,
} from './mdocWalletClaims'

const ISO_NS = 'org.iso.18013.5.1'
const EUDI_PID_NS = 'eu.europa.ec.eudi.pid.1'

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
      ['docType', 'org.iso.18013.5.1.mDL'],
      [
        'issuerSigned',
        new Map<unknown, unknown>([
          ['nameSpaces', new Map<unknown, unknown>([[ISO_NS, items]])],
        ]),
      ],
    ]),
  )
}

describe('mdocWalletClaims', () => {
  test('maps ISO 18013 namespace fields into wallet claim keys', () => {
    expect(
      mapIso18013NamespaceClaims({
        [ISO_NS]: {
          given_name: 'สมชาย',
          family_name: 'ใจดี',
          birth_date: '1990-05-15',
          document_number: '54002891',
          issue_date: '2024-01-20',
          expiry_date: '2030-01-31',
        },
      }),
    ).toEqual({
      givenName: 'สมชาย',
      familyName: 'ใจดี',
      birthDate: '1990-05-15',
      licenceNumber: '54002891',
      issuanceDate: '2024-01-20',
      expiryDate: '2030-01-31',
    })
  })

  test('maps driving privilege vehicle category into licenceClass', () => {
    expect(
      mapIso18013NamespaceClaims({
        [ISO_NS]: {
          driving_privileges: [{ vehicle_category_code: 'B' }] as unknown as string,
        },
      }),
    ).toEqual({
      licenceClass: 'B',
      driving_privileges: [{ vehicle_category_code: 'B' }],
    })
  })

  test('uses the first driving privilege vehicle category code only', () => {
    expect(
      mapIso18013NamespaceClaims({
        [ISO_NS]: {
          driving_privileges: [
            { vehicle_category_code: 'B' },
            { vehicle_category_code: 'A' },
          ] as unknown as string,
        },
      }),
    ).toEqual({
      licenceClass: 'B',
      driving_privileges: [
        { vehicle_category_code: 'B' },
        { vehicle_category_code: 'A' },
      ],
    })
  })

  test('maps ISO national-character names into Thai wallet claim keys', () => {
    expect(
      mapIso18013NamespaceClaims({
        [ISO_NS]: {
          given_name: 'SOMCHAI',
          family_name: 'SUKJAI',
          given_name_national_character: 'สมชาย',
          family_name_national_character: 'สุขใจ',
        },
      }),
    ).toEqual({
      givenName: 'SOMCHAI',
      familyName: 'SUKJAI',
      givenNameTh: 'สมชาย',
      familyNameTh: 'สุขใจ',
    })
  })

  test('maps document_number to licenceNumber and keeps leftover ISO keys', () => {
    expect(
      mapIso18013NamespaceClaims({
        [ISO_NS]: {
          document_number: '54002891',
          sex: '1',
          nationality: 'THA',
          issuing_authority: 'Department of Land Transport',
        },
      }),
    ).toEqual({
      licenceNumber: '54002891',
      sex: '1',
      nationality: 'THA',
      issuingAuthority: 'Department of Land Transport',
    })
  })

  test('extracts portrait bytes from issuer namespace claims', () => {
    const portrait = Uint8Array.from([0xff, 0xd8, 0xff, 0x01])
    expect(
      mapMdocNamespaceIssuerClaims({
        [ISO_NS]: {
          given_name: 'Ada',
          portrait,
        },
      }),
    ).toEqual({
      [`${ISO_NS}.given_name`]: 'Ada',
      [`${ISO_NS}.portrait`]: portrait,
    })
  })

  test('reads portrait bytes from encoded mdoc documents', () => {
    const portrait = Uint8Array.from([0xff, 0xd8, 0xff, 0xab])
    const bytes = encodeIssuerSignedDocument({ portrait, given_name: 'Ada' })

    expect(readMdocPhotoClaimValue(bytes)).toEqual(portrait)
    expect(extractMdocIssuerClaims(bytes)[`${ISO_NS}.portrait`]).toEqual(portrait)
    expect(extractMdocWalletClaims(bytes).portrait).toEqual(portrait)
  })

  test('maps EUDI PID namespace issuer claims with namespace-prefixed keys', () => {
    expect(
      mapMdocNamespaceIssuerClaims({
        [EUDI_PID_NS]: {
          family_name: 'Mustermann',
          given_name: 'Erika',
          birth_date: '1964-08-12',
        },
      }),
    ).toEqual({
      'eu.europa.ec.eudi.pid.1.family_name': 'Mustermann',
      'eu.europa.ec.eudi.pid.1.given_name': 'Erika',
      'eu.europa.ec.eudi.pid.1.birth_date': '1964-08-12',
    })
  })

  test('extracts third-party EUDI PID issuer claims from issuerSigned-as-root mdoc bytes', () => {
    const items = [
      new Map<unknown, unknown>([
        ['digestID', 0],
        ['random', new Uint8Array([1])],
        ['elementIdentifier', 'family_name'],
        ['elementValue', 'Mustermann'],
      ]),
      new Map<unknown, unknown>([
        ['digestID', 1],
        ['random', new Uint8Array([2])],
        ['elementIdentifier', 'given_name'],
        ['elementValue', 'Erika'],
      ]),
    ]
    const bytes = encode(
      new Map<unknown, unknown>([
        ['issuerAuth', new Uint8Array([0xd2])],
        ['nameSpaces', new Map<unknown, unknown>([[EUDI_PID_NS, items]])],
      ]),
    )

    expect(extractMdocIssuerClaims(bytes)).toEqual({
      'eu.europa.ec.eudi.pid.1.family_name': 'Mustermann',
      'eu.europa.ec.eudi.pid.1.given_name': 'Erika',
    })
  })

  test('extracts wallet claims from encoded mdoc bytes', () => {
    const bytes = encodeIssuerSignedDocument({
      given_name: 'สมชาย',
      family_name: 'ใจดี',
      birth_date: '1985-01-01',
      document_number: '123456789',
      issue_date: '2023-01-01',
      expiry_date: '2033-01-01',
      driving_privileges: [
        { vehicle_category_code: 'B' },
        { vehicle_category_code: 'A' },
      ],
    })

    expect(extractMdocWalletClaims(bytes)).toEqual({
      givenName: 'สมชาย',
      familyName: 'ใจดี',
      birthDate: '1985-01-01',
      licenceNumber: '123456789',
      issuanceDate: '2023-01-01',
      expiryDate: '2033-01-01',
      licenceClass: 'B',
      driving_privileges: [
        { vehicle_category_code: 'B' },
        { vehicle_category_code: 'A' },
      ],
    })
  })

  test('formats driving_privileges with CBOR-tagged issue and expiry dates', () => {
    expect(
      readDrivingPrivilegeDisplayValue([
        {
          vehicle_category_code: 'B',
          issue_date: { __tag: 1004, value: '2026-08-20' },
          expiry_date: { __tag: 1004, value: '2031-08-19' },
        },
      ]),
    ).toBe('B · Issue 2026-08-20 · Expiry 2031-08-19')
  })

  test('skips wallet mdoc remapping for third-party driving licence records', () => {
    const record: VerifiableCredentialRecord = {
      id: 'dl-tonyhere',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: { given_name: 'SOMCHAI' },
      issuedAt: '2026-01-01T00:00:00.000Z',
      issuerUrl: 'https://demo.tonyhere.work/',
    }
    const bytes = encodeIssuerSignedDocument({
      given_name: 'Ada',
      family_name: 'Lovelace',
    })

    expect(overlayDrivingLicenceMdocClaims(record, base64UrlEncodeBytes(bytes))).toEqual(record)
  })

  test('overlays mdoc claims onto a driving licence record and prefers mdoc values', () => {
    const bytes = encodeIssuerSignedDocument({
      given_name: 'สมชาย',
      family_name: 'ใจดี',
      document_number: '123456789',
      driving_privileges: [{ vehicle_category_code: 'A' }],
    })
    const record: VerifiableCredentialRecord = {
      id: 'dl-1',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: {
        givenName: 'FromSdJwt',
        licenceNumber: 'SD-JWT-LIC',
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
      issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
    }

    const overlaid = overlayDrivingLicenceMdocClaims(record, base64UrlEncodeBytes(bytes))
    expect(overlaid.claims.givenName).toBe('สมชาย')
    expect(overlaid.claims.familyName).toBe('ใจดี')
    expect(overlaid.claims.licenceNumber).toBe('123456789')
    expect(overlaid.claims.licenceClass).toBe('A')
    expect(overlaid.claims.driving_privileges).toEqual([{ vehicle_category_code: 'A' }])
  })

  test('keeps first-party SD-JWT driving privileges when leftover ISO copy is not an array', () => {
    const bytes = encodeIssuerSignedDocument({
      sex: '1',
      nationality: 'THA',
      driving_privileges: { vehicle_category_code: 'B' },
    })
    const record: VerifiableCredentialRecord = {
      id: 'dl-zenith',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      issuerUrl: 'https://issuer.zenithcomp.co.th:455/',
      claims: {
        vct: 'https://issuer.zenithcomp.co.th:455/credentials/DrivingLicense',
        driving_privileges: [{ vehicle_category_code: 'B' }],
        license_type: 'รถยนต์ส่วนบุคคล',
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    const overlaid = overlayDrivingLicenceMdocClaims(record, base64UrlEncodeBytes(bytes))
    expect(overlaid.claims.driving_privileges).toEqual([{ vehicle_category_code: 'B' }])
    expect(overlaid.claims.license_type).toBe('รถยนต์ส่วนบุคคล')
    expect(overlaid.claims.sex).toBe('1')
    expect(overlaid.claims.nationality).toBe('THA')
  })

  test('keeps existing claims when mdoc parse yields no mapped fields', () => {
    const record: VerifiableCredentialRecord = {
      id: 'dl-1',
      type: 'DLTDrivingLicence',
      rawVc: 'header.payload.signature',
      claims: { givenName: 'FromSdJwt', licenceNumber: 'SD-JWT-LIC' },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(overlayDrivingLicenceMdocClaims(record, 'AQIDBA').claims).toEqual(record.claims)
  })

  test('does not overlay mdoc claims onto non-driving-licence records', () => {
    const bytes = encodeIssuerSignedDocument({ given_name: 'Ada' })
    const record: VerifiableCredentialRecord = {
      id: 'transcript-1',
      type: 'ChulalongkornUniversityTranscript',
      rawVc: 'header.payload.signature',
      claims: { givenName: 'Keep' },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(overlayDrivingLicenceMdocClaims(record, base64UrlEncodeBytes(bytes)).claims.givenName).toBe(
      'Keep',
    )
  })
})
