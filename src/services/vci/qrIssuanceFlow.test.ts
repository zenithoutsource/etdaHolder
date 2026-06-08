import {
  claimConfirmedOffer,
  readCredentialPreviewDisplay,
  readCredentialInformationRows,
  readOfferConfirmationPreview,
} from './qrIssuanceFlow'
import type {
  ResolvedCredentialOffer,
  VerifiableCredentialRecord,
} from './exchangeService'

function makeResolvedOffer(overrides: Partial<ResolvedCredentialOffer> = {}): ResolvedCredentialOffer {
  return {
    offerUri: 'openid-credential-offer://example',
    issuer: 'https://issuer.example.com',
    credentialOffer: {} as ResolvedCredentialOffer['credentialOffer'],
    issuerMetadata: {} as ResolvedCredentialOffer['issuerMetadata'],
    issuerDisplay: { name: 'Bangkok University' },
    credentialConfigurations: [
      {
        id: 'BangkokUniversityTranscript',
        format: 'dc+sd-jwt',
        display: { name: 'Academic Transcript' },
        rawConfiguration: ({
          format: 'dc+sd-jwt',
          claims: {
            givenName: { display: [{ name: 'Given Name' }] },
            studentId: { display: [{ name: 'Student ID' }] },
          },
        } as unknown) as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
      },
    ],
    preAuthorizedCode: 'preauth',
    supportedFlows: ['pre-authorized_code'],
    version: 1,
    ...overrides,
  }
}

test('readOfferConfirmationPreview uses resolved offer metadata and expected claim labels', () => {
  const preview = readOfferConfirmationPreview(makeResolvedOffer())

  expect(preview.issuerName).toBe('Bangkok University')
  expect(preview.credentialName).toBe('Academic Transcript')
  expect(preview.format).toBe('dc+sd-jwt')
  expect(preview.informationItems).toEqual([
    { key: 'givenName', label: 'Given Name' },
    { key: 'studentId', label: 'Student ID' },
  ])
})

test('readOfferConfirmationPreview uses English fallback copy for unknown offer text', () => {
  const preview = readOfferConfirmationPreview(
    makeResolvedOffer({
      issuerDisplay: undefined,
      credentialConfigurations: [
        {
          id: 'UnknownCredential',
          format: 'jwt_vc_json',
          rawConfiguration: ({
            format: 'jwt_vc_json',
          } as unknown) as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
        },
      ],
    }),
  )

  expect(preview.issuerName).toBe('Unknown Issuer')
  expect(preview.credentialName).toBe('Digital Document')
  expect(preview.informationItems).toEqual([{ key: 'credential', label: 'Credential to receive' }])
})

test('readOfferConfirmationPreview falls back to claim keys for placeholder display names', () => {
  const preview = readOfferConfirmationPreview(
    makeResolvedOffer({
      credentialConfigurations: [
        {
          id: 'BootCampCredential_dc+sd-jwt',
          format: 'dc+sd-jwt',
          display: { name: 'BootCampCredential' },
          rawConfiguration: ({
            format: 'dc+sd-jwt',
            claims: {
              fullname: { display: [{ name: 'string' }] },
              birthdate: { display: [{ name: 'string' }] },
              idcard: { display: [{ name: 'string' }] },
            },
          } as unknown) as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
        },
      ],
    }),
  )

  expect(preview.informationItems).toEqual([
    { key: 'fullname', label: 'fullname' },
    { key: 'birthdate', label: 'birthdate' },
    { key: 'idcard', label: 'idcard' },
  ])
})

test('claimConfirmedOffer claims and stores only after confirmation with tx_code', async () => {
  const offer = makeResolvedOffer()
  const record: VerifiableCredentialRecord = {
    id: 'record-1',
    type: 'BangkokUniversityTranscript',
    rawVc: 'header.payload.signature',
    claims: {},
    issuedAt: '2026-06-04T00:00:00.000Z',
  }
  const claimCredential = jest.fn(async () => record)

  await expect(claimConfirmedOffer(offer, { tx_code: '123456', claimCredential })).resolves.toBe(record)

  expect(claimCredential).toHaveBeenCalledWith(offer, { tx_code: '123456' })
})

test('readCredentialInformationRows shows actual credential values from the acquired record', () => {
  const record: VerifiableCredentialRecord = {
    id: 'record-1',
    type: 'BangkokUniversityTranscript',
    rawVc: 'header.payload.signature',
    claims: {
      givenName: 'Ada',
      familyName: 'Lovelace',
      studentId: 'BU-123',
      degree: 'Computer Science',
      gpa: '3.91',
    },
    issuedAt: '2026-06-04T00:00:00.000Z',
  }

  const rows = readCredentialInformationRows(record, [
    { key: 'studentId', label: 'Student ID' },
    { key: 'degree', label: 'Degree' },
    { key: 'gpa', label: 'GPA' },
  ])

  expect(rows).toEqual([
    { key: 'studentId', label: 'Student ID', value: 'BU-123' },
    { key: 'degree', label: 'Degree', value: 'Computer Science' },
    { key: 'gpa', label: 'GPA', value: '3.91' },
  ])
})

test('readCredentialPreviewDisplay shows actual values for the scan confirmation screen', () => {
  const record: VerifiableCredentialRecord = {
    id: 'record-1',
    type: 'BangkokUniversityTranscript',
    rawVc: 'header.payload.signature',
    claims: {
      studentId: 'BU-123',
      degree: 'Computer Science',
      gpa: '3.91',
    },
    issuedAt: '2026-06-04T00:00:00.000Z',
  }

  const preview = readCredentialPreviewDisplay(record)

  expect(preview.documentTitle).toBe('TRANSCRIPT')
  expect(preview.imageKey).toBe('transcript')
  expect(preview.rows).toEqual([
    { key: 'studentId', label: 'Student ID', value: 'BU-123' },
    { key: 'degree', label: 'Degree', value: 'Computer Science' },
    { key: 'gpa', label: 'GPA', value: '3.91' },
  ])
})
