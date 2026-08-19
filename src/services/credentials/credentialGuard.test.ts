import {
  canPresentCredentialType,
  canRequestCredentialType,
  canSubmitCredentialRenewal,
  hasPidCredential,
  hasUsablePidCredential,
  isPidCredentialOffer,
  pickPreferredHomeCredential,
  readPidGateStatus,
} from './credentialGuard'
import {
  type CredentialRenewalRecord,
} from './credentialKeyRenewal'
import {
  clearCredentialLifecycleStatus,
  recordCredentialLifecycleAction,
} from './credentialLifecycle'
import { writeIssuerSuspension } from './issuerSuspension'
import { getCredentialStorage } from '../storage/storage'
import { credentialRequiresHardwareReissue } from '../crypto/hardwareCredentialSigningKey'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

jest.mock('../crypto/hardwareCredentialSigningKey', () => {
  const actual = jest.requireActual('../crypto/hardwareCredentialSigningKey') as typeof import('../crypto/hardwareCredentialSigningKey')
  return {
    ...actual,
    credentialRequiresHardwareReissue: jest.fn(() => false),
  }
})

const credentialRequiresHardwareReissueMock = credentialRequiresHardwareReissue as jest.MockedFunction<
  typeof credentialRequiresHardwareReissue
>

jest.mock('../storage/storage', () => {
  const values = new Map<string, string>()
  const storage = {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value)
    },
    delete: (key: string) => {
      values.delete(key)
    },
    remove: (key: string) => {
      values.delete(key)
      return true
    },
    getAllKeys: () => [...values.keys()],
    clearAll: () => values.clear(),
  }
  return {
    getCredentialStorage: () => storage,
    getMetaStorage: () => storage,
  }
})

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
  type: 'ChulalongkornUniversityTranscript',
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
  beforeEach(() => {
    credentialRequiresHardwareReissueMock.mockReturnValue(false)
  })
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

  test('blocks presenting other credentials until a usable PID exists', () => {
    expect(canPresentCredentialType('ThaiNationalID', [])).toBe(true)
    expect(canPresentCredentialType('DLTDrivingLicence', [])).toBe(false)
    expect(canPresentCredentialType('DLTDrivingLicence', [transcriptRecord])).toBe(false)
    expect(canPresentCredentialType(undefined, [thaiIdRecord])).toBe(false)
    expect(canPresentCredentialType('DLTDrivingLicence', [thaiIdRecord], {})).toBe(true)
    expect(
      canPresentCredentialType('ChulalongkornUniversityTranscript', [thaiIdRecord], {}),
    ).toBe(true)
  })

  test('blocks other credentials until renewed-active ThaiNationalID exists', () => {
    expect(
      canRequestCredentialType('DLTDrivingLicence', [thaiIdRecord], renewalStatuses),
    ).toBe(false)
    expect(canPresentCredentialType('DLTDrivingLicence', [thaiIdRecord], renewalStatuses)).toBe(
      false,
    )
    expect(readPidGateStatus([thaiIdRecord], renewalStatuses)).toBe('renewal-required')

    const renewedStatuses = {
      'id-card-2': renewalStatuses['id-card-2'],
    }

    expect(
      canRequestCredentialType('DLTDrivingLicence', [renewedThaiIdRecord], renewedStatuses),
    ).toBe(true)
    expect(hasUsablePidCredential([renewedThaiIdRecord], renewedStatuses)).toBe(true)
  })

  test('allows other credential requests while ThaiNationalID is cleanup-pending', () => {
    const cleanupStatuses = {
      'id-card-1': {
        credentialId: 'id-card-1',
        previousHolderDid: 'did:key:old',
        replacementCredentialId: 'id-card-2',
        state: 'cleanup-pending',
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
    } satisfies Record<string, CredentialRenewalRecord>

    expect(hasUsablePidCredential([thaiIdRecord], cleanupStatuses)).toBe(true)
    expect(readPidGateStatus([thaiIdRecord], cleanupStatuses)).toBe('ready')
    expect(
      canRequestCredentialType('ChulalongkornUniversityTranscript', [thaiIdRecord], cleanupStatuses),
    ).toBe(true)
  })

  test('prevents duplicate ThaiNationalID renewal after renewed-active exists', () => {
    const credentials = [thaiIdRecord, renewedThaiIdRecord]

    expect(canRequestCredentialType('ThaiNationalID', credentials, renewalStatuses)).toBe(false)
    expect(canSubmitCredentialRenewal('id-card-1', credentials, renewalStatuses)).toBe(false)
  })

  test('allows hardware P3 of another document while PID is only renewal-required', () => {
    const drivingLicence: VerifiableCredentialRecord = {
      id: 'dl-1',
      type: 'DLTDrivingLicence',
      rawVc: 'vc-dl',
      claims: {},
      issuedAt: '2026-03-01T00:00:00.000Z',
    }
    const statuses = {
      ...renewalStatuses,
      'dl-1': {
        credentialId: 'dl-1',
        previousHolderDid: 'did:key:dl',
        state: 'renewal-required',
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
    } satisfies Record<string, CredentialRenewalRecord>

    expect(readPidGateStatus([thaiIdRecord, drivingLicence], statuses)).toBe('renewal-required')
    expect(canSubmitCredentialRenewal('dl-1', [thaiIdRecord, drivingLicence], statuses)).toBe(true)
    expect(canRequestCredentialType('DLTDrivingLicence', [thaiIdRecord, drivingLicence], statuses)).toBe(
      false,
    )
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

  test('treats issuer-suspended PID as unusable and re-requestable', () => {
    writeIssuerSuspension({
      credentialId: thaiIdRecord.id,
      suspendedAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })

    try {
      expect(hasUsablePidCredential([thaiIdRecord], {})).toBe(false)
      expect(readPidGateStatus([thaiIdRecord], {})).toBe('suspended')
      expect(canPresentCredentialType('DLTDrivingLicence', [thaiIdRecord], {})).toBe(false)
      expect(canRequestCredentialType('ThaiNationalID', [thaiIdRecord], {})).toBe(true)
      expect(
        canRequestCredentialType('ChulalongkornUniversityTranscript', [thaiIdRecord], {}),
      ).toBe(false)
    } finally {
      getCredentialStorage().remove(`credential:suspension:${thaiIdRecord.id}`)
    }
  })

  test('treats holder-revoked PID as unusable and re-requestable', () => {
    recordCredentialLifecycleAction(thaiIdRecord.id, 'Revoke')

    try {
      expect(hasUsablePidCredential([thaiIdRecord], {})).toBe(false)
      expect(readPidGateStatus([thaiIdRecord], {})).toBe('suspended')
      expect(canPresentCredentialType('DLTDrivingLicence', [thaiIdRecord], {})).toBe(false)
      expect(canRequestCredentialType('ThaiNationalID', [thaiIdRecord], {})).toBe(true)
      expect(
        canRequestCredentialType('ChulalongkornUniversityTranscript', [thaiIdRecord], {}),
      ).toBe(false)
    } finally {
      clearCredentialLifecycleStatus(thaiIdRecord.id)
    }
  })

  test('allows ThaiNationalID re-issue when only document-expired PID exists', () => {
    const expiredPid: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      expiresAt: '2020-01-01T00:00:00.000Z',
    }

    expect(hasUsablePidCredential([expiredPid], {})).toBe(false)
    expect(readPidGateStatus([expiredPid], {})).toBe('document-expired')
    expect(canRequestCredentialType('ThaiNationalID', [expiredPid], {})).toBe(true)
  })

  test('classifies calendar-expired PID plus expired driving licence as document-expired', () => {
    const expiredPid: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      expiresAt: '2020-01-01T00:00:00.000Z',
    }
    const expiredDrivingLicence: VerifiableCredentialRecord = {
      id: 'dl-expired',
      type: 'DLTDrivingLicence',
      rawVc: 'vc-dl',
      claims: {},
      issuedAt: '2020-01-01T00:00:00.000Z',
      expiresAt: '2020-06-01T00:00:00.000Z',
    }

    expect(readPidGateStatus([expiredPid, expiredDrivingLicence], {})).toBe('document-expired')
  })

  test('does not treat leftover P3 renewal-required as the PID gate when the document is expired', () => {
    const expiredPid: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      expiresAt: '2020-01-01T00:00:00.000Z',
    }
    const statuses = {
      'id-card-1': {
        credentialId: 'id-card-1',
        previousHolderDid: 'did:key:old',
        state: 'renewal-required',
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
    } satisfies Record<string, CredentialRenewalRecord>

    expect(readPidGateStatus([expiredPid], statuses)).toBe('document-expired')
  })

  test('blocks P3 submit when the document is already expired', () => {
    const expiredPid: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      expiresAt: '2020-01-01T00:00:00.000Z',
    }
    const statuses = {
      'id-card-1': {
        credentialId: 'id-card-1',
        previousHolderDid: 'did:key:old',
        state: 'renewal-required',
        updatedAt: '2026-06-26T00:00:00.000Z',
      },
    } satisfies Record<string, CredentialRenewalRecord>

    expect(canSubmitCredentialRenewal('id-card-1', [expiredPid], statuses)).toBe(false)
    expect(canRequestCredentialType('ThaiNationalID', [expiredPid], statuses)).toBe(true)
  })

  test('prefers non-expired credential on home list', () => {
    const expiredPid: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      id: 'id-card-expired',
      expiresAt: '2020-01-01T00:00:00.000Z',
    }
    const activePid: VerifiableCredentialRecord = {
      ...thaiIdRecord,
      id: 'id-card-active',
      expiresAt: '2035-01-01T00:00:00.000Z',
    }

    const picked = pickPreferredHomeCredential([expiredPid, activePid], {})
    expect(picked?.id).toBe('id-card-active')
  })

  test('prefers an mdoc Driving Licence over a JWT Driving Licence of the same type', () => {
    const jwtLicence: VerifiableCredentialRecord = {
      id: 'dlt-jwt',
      type: 'DLTDrivingLicence',
      rawVc: 'eyJhbGciOiJFZERTQSJ9.e30.sig',
      claims: {},
      issuedAt: '2026-01-01T00:00:00.000Z',
    }
    const mdocLicence: VerifiableCredentialRecord = {
      id: 'dlt-mdoc',
      type: 'DLTDrivingLicence',
      rawVc: 'mdoc:abc',
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
      issuedAt: '2026-08-14T00:00:00.000Z',
    }

    const picked = pickPreferredHomeCredential([jwtLicence, mdocLicence], {})
    expect(picked?.id).toBe('dlt-mdoc')
  })

  test('prefers a new active PID over an issuer-suspended PID of the same type', () => {
    writeIssuerSuspension({
      credentialId: thaiIdRecord.id,
      suspendedAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    })

    try {
      const picked = pickPreferredHomeCredential([thaiIdRecord, renewedThaiIdRecord], {})
      expect(picked?.id).toBe('id-card-2')
    } finally {
      getCredentialStorage().remove(`credential:suspension:${thaiIdRecord.id}`)
    }
  })

  test('treats Ed25519 PID as unusable and re-requestable when hardware reissue is required', () => {
    credentialRequiresHardwareReissueMock.mockImplementation(
      (credentialId) => credentialId === thaiIdRecord.id,
    )

    expect(hasUsablePidCredential([thaiIdRecord], {})).toBe(false)
    expect(readPidGateStatus([thaiIdRecord], {})).toBe('renewal-required')
    expect(canRequestCredentialType('ThaiNationalID', [thaiIdRecord], {})).toBe(true)
    expect(
      canRequestCredentialType('ChulalongkornUniversityTranscript', [thaiIdRecord], {}),
    ).toBe(false)
  })

  test('prefers a hardware-keyed credential over a legacy Ed25519 card of the same type', () => {
    credentialRequiresHardwareReissueMock.mockImplementation(
      (credentialId) => credentialId === thaiIdRecord.id,
    )

    const picked = pickPreferredHomeCredential([thaiIdRecord, renewedThaiIdRecord], {})
    expect(picked?.id).toBe('id-card-2')
  })
})
