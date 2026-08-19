import { encode } from 'cbor-x'

import { base64UrlEncodeBytes } from '@/src/utils/base64Url'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  extractMdocWalletClaims,
  mapIso18013NamespaceClaims,
  overlayDrivingLicenceMdocClaims,
} from './mdocWalletClaims'

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
    })
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
    }

    const overlaid = overlayDrivingLicenceMdocClaims(record, base64UrlEncodeBytes(bytes))
    expect(overlaid.claims.givenName).toBe('สมชาย')
    expect(overlaid.claims.familyName).toBe('ใจดี')
    expect(overlaid.claims.licenceNumber).toBe('123456789')
    expect(overlaid.claims.licenceClass).toBe('A')
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
