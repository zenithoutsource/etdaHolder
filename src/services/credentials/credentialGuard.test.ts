import {
  canRequestCredentialType,
  canSubmitCredentialRenewal,
  hasPidCredential,
  hasUsablePidCredential,
  isPidCredentialOffer,
  pickPreferredHomeCredential,
  readPidGateStatus,
} from './credentialGuard'
import {
  readCredentialRenewal,
  type CredentialRenewalRecord,
} from './credentialKeyRenewal'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const thaiIdRecord: VerifiableCredentialRecord = {
  id: 'id-card-1',
  type: 'ThaiNationalID',
  rawVc: 'vc',
  claims: {},
  issuedAt: '2026-06-09T00:00:00.000Z',
}

const renewedThaiIdRecord: VerifiableCredentialRecord = {
  id: 'id-card-2',
  type: 'ThaiNationalID',
  rawVc: 'vc-new',
  claims: {},
  issuedAt: '2026-06-26T00:00:00.000Z',
}

const transcriptRecord: VerifiableCredentialRecord = {
  id: 'transcript-1',
  type: 'BangkokUniversityTranscript',
  rawVc: 'vc',
  claims: {},
  issuedAt: '2026-06-09T00:00:00.000Z',
}

const renewalStatuses = {
  'id-card-1': {
    credentialId: 'id-card-1',
    previousHolderDid: 'did:key:old',
    state: 'renewal-required',
    updatedAt: '2026-06-26T00:00:00.000Z',
  },
  'id-card-2': {
    credentialId: 'id-card-2',
    previousHolderDid: 'did:key:old',
    replacementCredentialId: 'id-card-2',
    state: 'renewed-active',
    updatedAt: '2026-06-26T00:00:00.000Z',
  },
} satisfies Record<string, CredentialRenewalRecord>

describe('credentialGuard', () => {
  test('detects the foundational PID credential from stored records', () => {
    expect(hasPidCredential([])).toBe(false)
    expect(hasPidCredential([transcriptRecord])).toBe(false)
    expect(hasPidCredential([transcriptRecord, thaiIdRecord])).toBe(true)
  })

  test('recognizes ThaiNationalID and idcard resolved offers as PID offers', () => {
    expect(isPidCredentialOffer({ credentialConfigurations: [{ id: 'ThaiNationalID' }] })).toBe(true)
    expect(isPidCredentialOffer({ credentialConfigurations: [{ id: 'idcard' }] })).toBe(true)
    expect(isPidCredentialOffer({ credentialConfigurations: [{ id: 'TranscriptCredential_dc+sd-jwt' }] })).toBe(false)
  })

  test('allows ThaiNationalID requests before PID and gates other requests until PID exists', () => {
    expect(canRequestCredentialType('ThaiNationalID', [])).toBe(true)
    expect(canRequestCredentialType('DLTDrivingLicence', [])).toBe(false)
    expect(canRequestCredentialType(undefined, [])).toBe(false)
    expect(canRequestCredentialType('DLTDrivingLicence', [thaiIdRecord], {})).toBe(true)
    expect(canRequestCredentialType(undefined, [thaiIdRecord], {})).toBe(false)
  })

  test('blocks other credentials until renewed-active ThaiNationalID exists', () => {
    expect(
      canRequestCredentialType('DLTDrivingLicence', [thaiIdRecord], renewalStatuses),
    ).toBe(false)
    expect(readPidGateStatus([thaiIdRecord], renewalStatuses)).toBe('renewal-required')

    const renewedStatuses = {
      'id-card-2': renewalStatuses['id-card-2'],
    }

    expect(
      canRequestCredentialType('DLTDrivingLicence', [renewedThaiIdRecord], renewedStatuses),
    ).toBe(true)
    expect(hasUsablePidCredential([renewedThaiIdRecord], renewedStatuses)).toBe(true)
  })

  test('prevents duplicate ThaiNationalID renewal after renewed-active exists', () => {
    const credentials = [thaiIdRecord, renewedThaiIdRecord]

    expect(canRequestCredentialType('ThaiNationalID', credentials, renewalStatuses)).toBe(false)
    expect(canSubmitCredentialRenewal('id-card-1', credentials, renewalStatuses)).toBe(false)
  })

  test('prefers renewed-active credential on home list', () => {
    const picked = pickPreferredHomeCredential(
      [thaiIdRecord, renewedThaiIdRecord],
      renewalStatuses,
    )

    expect(picked?.id).toBe('id-card-2')
  })

  test('prefers normal active credential over cleanup-pending old VC of same type', () => {
    const oldCleanupRecord: VerifiableCredentialRecord = {
      id: 'id-card-old',
      type: 'ThaiNationalID',
      rawVc: 'vc-old',
      claims: {},
      issuedAt: '2026-01-01T00:00:00.000Z',
    }
    const newActiveRecord: VerifiableCredentialRecord = {
      id: 'id-card-new',
      type: 'ThaiNationalID',
      rawVc: 'vc-new',
      claims: {},
      issuedAt: '2026-06-26T00:00:00.000Z',
    }
    const statuses = {
      'id-card-old': {
        credentialId: 'id-card-old',
        previousHolderDid: 'did:key:old',
        replacementCredentialId: 'id-card-new',
        state: 'cleanup-pending',
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
    } satisfies Record<string, CredentialRenewalRecord>

    const picked = pickPreferredHomeCredential(
      [oldCleanupRecord, newActiveRecord],
      statuses,
    )

    expect(picked?.id).toBe('id-card-new')
  })
})
