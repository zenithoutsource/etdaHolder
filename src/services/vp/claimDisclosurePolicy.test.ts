import {
  applyDisclosurePolicyFlags,
  collectClaimPolicyLookupKeys,
  enrichDisclosuresWithPolicy,
  findCredentialConfigurationId,
  normalizeClaimPolicyKey,
  parseClaimDisclosurePolicyFromCredentialMetadata,
  readClaimPolicyFromCardSchema,
  readPolicyFlags,
  resolveClaimDisclosurePolicyEntry,
  resolveEffectiveDisclosureKeys,
} from './claimDisclosurePolicy'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import type { PresentationDisclosure } from './presentationService'

const baseRecord: VerifiableCredentialRecord = {
  id: 'cred-1',
  type: 'ThaiNationalID',
  rawVc: 'issuer.jwt~disclosure~',
  claims: { full_name: 'Test User' },
  issuedAt: '2026-01-01T00:00:00.000Z',
}

describe('claimDisclosurePolicy', () => {
  test('parseClaimDisclosurePolicyFromCredentialMetadata maps mandatory and selective claims', () => {
    const policy = parseClaimDisclosurePolicyFromCredentialMetadata({
      format: 'dc+sd-jwt',
      credential_metadata: {
        claims: [
          { path: ['national_id'], mandatory: true },
          { path: ['full_name'], sd: true },
          { path: ['religion'], sd: false },
        ],
      },
    } as never)

    expect(policy).toEqual({
      [normalizeClaimPolicyKey('national_id')]: { md: true, mandatory: true, sd: true },
      [normalizeClaimPolicyKey('full_name')]: { md: false, sd: true },
      [normalizeClaimPolicyKey('religion')]: { md: false, sd: false },
    })
  })

  test('parseClaimDisclosurePolicyFromCredentialMetadata reads top-level claims array', () => {
    const policy = parseClaimDisclosurePolicyFromCredentialMetadata({
      format: 'dc+sd-jwt',
      claims: [
        { path: ['student_id'], mandatory: true, sd: true },
        { path: ['gpa'], mandatory: false, sd: true },
        { path: ['institution_name'], mandatory: true, sd: false },
      ],
    } as never)

    expect(policy).toEqual({
      [normalizeClaimPolicyKey('student_id')]: { md: true, mandatory: true, sd: true },
      [normalizeClaimPolicyKey('gpa')]: { md: false, mandatory: false, sd: true },
      [normalizeClaimPolicyKey('institution_name')]: { md: true, mandatory: true, sd: false },
    })
  })

  test('keeps mandatory and sd metadata independent for consent selection', () => {
    const policy = parseClaimDisclosurePolicyFromCredentialMetadata({
      format: 'dc+sd-jwt',
      claims: [{ path: ['student_id'], mandatory: true, sd: true }],
    } as never)

    expect(policy?.[normalizeClaimPolicyKey('student_id')]).toEqual({
      md: true,
      mandatory: true,
      sd: true,
    })
    expect(readPolicyFlags(policy?.[normalizeClaimPolicyKey('student_id')]!)).toEqual({
      mandatory: true,
      selective: false,
    })
  })

  test('parseClaimDisclosurePolicyFromCredentialMetadata reads top-level claims object', () => {
    const policy = parseClaimDisclosurePolicyFromCredentialMetadata({
      format: 'dc+sd-jwt',
      claims: {
        id_number: { mandatory: true, sd: true },
        religion: { mandatory: false, sd: true },
      },
    } as never)

    expect(policy).toEqual({
      [normalizeClaimPolicyKey('id_number')]: { md: true, mandatory: true, sd: true },
      [normalizeClaimPolicyKey('religion')]: { md: false, mandatory: false, sd: true },
    })
  })

  test('resolveClaimDisclosurePolicyEntry prefers stored policy over card schema', () => {
    const record: VerifiableCredentialRecord = {
      ...baseRecord,
      claimDisclosurePolicy: {
        [normalizeClaimPolicyKey('birthdate')]: { md: true, sd: false },
      },
    }

    expect(resolveClaimDisclosurePolicyEntry(record, 'birthdate')).toEqual({ md: true, sd: false })
  })

  test('resolveClaimDisclosurePolicyEntry matches stored policy via schema aliases', () => {
    const record: VerifiableCredentialRecord = {
      ...baseRecord,
      type: 'ChulalongkornUniversityTranscript',
      claimDisclosurePolicy: {
        [normalizeClaimPolicyKey('student_id')]: { md: true, sd: false },
        [normalizeClaimPolicyKey('gpa')]: { md: false, sd: true },
      },
    }

    expect(resolveClaimDisclosurePolicyEntry(record, 'studentId')).toEqual({ md: true, sd: false })
    expect(resolveClaimDisclosurePolicyEntry(record, 'gpa')).toEqual({ md: false, sd: true })
  })

  test('readClaimPolicyFromCardSchema applies transcript mandatory fallback metadata', () => {
    expect(readClaimPolicyFromCardSchema('ChulalongkornUniversityTranscript', 'faculty')).toEqual({
      md: true,
      sd: false,
    })
    expect(readClaimPolicyFromCardSchema('ChulalongkornUniversityTranscript', 'gpa')).toEqual({
      md: false,
      sd: true,
    })
  })

  test('enrichDisclosuresWithPolicy fetches issuer metadata when stored policy is missing', async () => {
    const record: VerifiableCredentialRecord = {
      ...baseRecord,
      type: 'ChulalongkornUniversityTranscript',
      rawVc: 'issuer.jwt.with.vct~disclosure~',
      issuerUrl: 'http://issuer.example.com',
      claims: { vct: 'http://issuer.example.com/credentials/TranscriptCredential' },
    }

    const disclosures = await enrichDisclosuresWithPolicy(
      record,
      [
        { key: 'student_id', label: 'Student ID', value: '65010001' },
        { key: 'gpa', label: 'GPA', value: '3.50' },
      ],
      {
        fetchIssuerMetadata: async () =>
          ({
            credential_configurations_supported: {
              'TranscriptCredential_dc+sd-jwt': {
                format: 'dc+sd-jwt',
                claims: [
                  { path: ['student_id'], mandatory: true, sd: true },
                  { path: ['gpa'], mandatory: false, sd: true },
                ],
              },
            },
          }) as never,
      },
    )

    expect(disclosures).toEqual([
      expect.objectContaining({ key: 'student_id', value: '65010001', mandatory: true, selective: false }),
      expect.objectContaining({ key: 'gpa', value: '3.50', mandatory: false, selective: true }),
    ])
  })

  test('findCredentialConfigurationId resolves configuration from credential vct', () => {
    const record: VerifiableCredentialRecord = {
      ...baseRecord,
      type: 'ChulalongkornUniversityTranscript',
      claims: { vct: 'http://issuer.example.com/credentials/TranscriptCredential' },
    }

    expect(
      findCredentialConfigurationId(record, {
        credential_configurations_supported: {
          'TranscriptCredential_dc+sd-jwt': {
            vct: 'http://issuer.example.com/credentials/TranscriptCredential',
          },
        },
      } as never),
    ).toBe('TranscriptCredential_dc+sd-jwt')
  })

  test('collectClaimPolicyLookupKeys includes schema aliases', () => {
    expect(collectClaimPolicyLookupKeys('ChulalongkornUniversityTranscript', 'studentId')).toEqual(
      expect.arrayContaining([
        normalizeClaimPolicyKey('studentId'),
        normalizeClaimPolicyKey('student_id'),
      ]),
    )
  })

  test('applyDisclosurePolicyFlags marks mandatory and selective disclosures', () => {
    const record: VerifiableCredentialRecord = {
      ...baseRecord,
      claimDisclosurePolicy: {
        [normalizeClaimPolicyKey('national_id')]: { md: true, sd: false },
        [normalizeClaimPolicyKey('religion')]: { md: false, sd: true },
      },
    }
    const disclosures: PresentationDisclosure[] = [
      { key: 'national_id', label: 'ID', value: '123' },
      { key: 'religion', label: 'Religion', value: 'Buddhist' },
    ]

    expect(applyDisclosurePolicyFlags(record, disclosures)).toEqual([
      {
        key: 'national_id',
        label: 'เลขบัตรประจำตัวประชาชน',
        value: '123',
        mandatory: true,
        selective: false,
      },
      {
        key: 'religion',
        label: 'ศาสนา',
        value: 'Buddhist',
        mandatory: false,
        selective: true,
      },
    ])
  })

  test('resolveEffectiveDisclosureKeys always includes mandatory claims', () => {
    const disclosures = [
      { key: 'national_id', mandatory: true },
      { key: 'religion', mandatory: false },
    ]

    expect(resolveEffectiveDisclosureKeys(disclosures, new Set(['religion']))).toEqual(['national_id', 'religion'])
    expect(resolveEffectiveDisclosureKeys(disclosures, new Set())).toEqual(['national_id'])
  })

  test('resolveEffectiveDisclosureKeys always includes non-selectively-disclosable claims', () => {
    const disclosures = [
      { key: 'institution_name', mandatory: false, selective: false },
      { key: 'gpa', mandatory: false, selective: true },
    ]

    expect(resolveEffectiveDisclosureKeys(disclosures, new Set())).toEqual(['institution_name'])
  })
})
