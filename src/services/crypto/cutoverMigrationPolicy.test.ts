import { readCredentialLifecycleStatus } from '../credentials/credentialLifecycle'
import {
  PID_CREDENTIAL_TYPE,
  assessCutoverReissueGate,
  assertCutoverReissueAllowed,
  assertHardwareCutoverLegacyRenewalBlocked,
  assertHardwareCutoverReissueAllowed,
  assertHardwareCutoverReissueAllowedForOffer,
  readCutoverReissueWalletState,
  rejectLegacyKeyRenewalPresentation,
  resolveCutoverCredentialTypeFromOffer,
} from './cutoverMigrationPolicy'

jest.mock('../credentials/credentialLifecycle', () => ({
  readCredentialLifecycleStatus: jest.fn(() => undefined),
}))

jest.mock('../credentials/issuerSuspension', () => ({
  readIssuerSuspension: jest.fn(() => undefined),
}))

jest.mock('../credentials/credentialKeyRenewal', () => ({
  readCredentialRenewal: jest.fn(() => undefined),
  readCredentialRenewalStatuses: jest.fn(() => ({})),
}))

const legacyCutoverReaders = {
  isHardwareEnabled: () => true,
  listLegacyEd25519Keys: () => [{ credentialId: 'vc-ed25519-pid' }],
  readCredentials: () => [{ id: 'vc-ed25519-pid', type: PID_CREDENTIAL_TYPE }],
  hasHardwareKey: () => false,
}

describe('cutoverMigrationPolicy', () => {
  beforeEach(() => {
    jest.mocked(readCredentialLifecycleStatus).mockReset()
    jest.mocked(readCredentialLifecycleStatus).mockReturnValue(undefined)
  })

  test('allows non-PID reissue when no legacy Ed25519 credentials remain', () => {
    expect(
      assessCutoverReissueGate({
        credentialType: 'ChulalongkornUniversityTranscript',
        hasLegacyEd25519Credentials: false,
        hasHardwarePidCredential: false,
      }),
    ).toEqual({ allowed: true })
  })

  test('blocks non-PID reissue until hardware PID exists during cutover', () => {
    const gate = assessCutoverReissueGate({
      credentialType: 'ChulalongkornUniversityTranscript',
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: false,
    })

    expect(gate.allowed).toBe(false)
    if (!gate.allowed) {
      expect(gate.reason).toBe('reissue_pid_first')
    }
  })

  test('allows non-PID reissue after hardware PID exists', () => {
    expect(
      assessCutoverReissueGate({
        credentialType: 'ChulalongkornUniversityTranscript',
        hasLegacyEd25519Credentials: true,
        hasHardwarePidCredential: true,
      }),
    ).toEqual({ allowed: true })
  })

  test('always allows PID reissue during cutover', () => {
    expect(
      assessCutoverReissueGate({
        credentialType: PID_CREDENTIAL_TYPE,
        hasLegacyEd25519Credentials: true,
        hasHardwarePidCredential: false,
      }),
    ).toEqual({ allowed: true })
  })

  test('assertCutoverReissueAllowed throws for blocked non-PID reissue', () => {
    expect(() =>
      assertCutoverReissueAllowed({
        credentialType: 'ChulalongkornUniversityTranscript',
        hasLegacyEd25519Credentials: true,
        hasHardwarePidCredential: false,
      }),
    ).toThrow('Reissue your national ID')
  })

  test('rejectLegacyKeyRenewalPresentation throws unsupported error', () => {
    expect(() => rejectLegacyKeyRenewalPresentation()).toThrow('Legacy key renewal presentation is unsupported')
  })

  test('readCutoverReissueWalletState treats Ed25519 registry rows as legacy credentials', () => {
    expect(
      readCutoverReissueWalletState({
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => [{ credentialId: 'vc-ed25519-dl' }],
        readCredentials: () => [],
        hasHardwareKey: () => false,
      }),
    ).toEqual({
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: false,
    })
  })

  test('readCutoverReissueWalletState treats stored credentials without hardware keys as legacy', () => {
    expect(
      readCutoverReissueWalletState({
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => [],
        readCredentials: () => [{ id: 'vc-ed25519-pid', type: PID_CREDENTIAL_TYPE }],
        hasHardwareKey: () => false,
      }),
    ).toEqual({
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: false,
    })
  })

  test('readCutoverReissueWalletState detects a hardware PID even when legacy keys remain', () => {
    expect(
      readCutoverReissueWalletState({
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => [{ credentialId: 'vc-ed25519-dl' }],
        readCredentials: () => [
          { id: 'vc-hw-pid', type: PID_CREDENTIAL_TYPE },
          { id: 'vc-ed25519-dl', type: 'DLTDrivingLicence' },
        ],
        hasHardwareKey: (id) => id === 'vc-hw-pid',
      }),
    ).toEqual({
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: true,
    })
  })

  test('readCutoverReissueWalletState fail-closes when credential and key registries cannot be read', () => {
    expect(
      readCutoverReissueWalletState({
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => {
          throw new Error('StorageNotInitialized')
        },
        readCredentials: () => {
          throw new Error('StorageNotInitialized')
        },
        hasHardwareKey: () => false,
      }),
    ).toEqual({
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: false,
    })
  })

  test('assertHardwareCutoverReissueAllowed blocks non-PID when wallet state cannot be read', () => {
    expect(() =>
      assertHardwareCutoverReissueAllowed('DLTDrivingLicence', {
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => {
          throw new Error('StorageNotInitialized')
        },
        readCredentials: () => {
          throw new Error('StorageNotInitialized')
        },
        hasHardwareKey: () => false,
      }),
    ).toThrow('Reissue your national ID')
  })

  test('assertHardwareCutoverReissueAllowed still allows PID when wallet state cannot be read', () => {
    expect(() =>
      assertHardwareCutoverReissueAllowed(PID_CREDENTIAL_TYPE, {
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => {
          throw new Error('StorageNotInitialized')
        },
        readCredentials: () => {
          throw new Error('StorageNotInitialized')
        },
        hasHardwareKey: () => false,
      }),
    ).not.toThrow()
  })

  test('readCutoverReissueWalletState fail-closes when only credential storage cannot be read', () => {
    expect(
      readCutoverReissueWalletState({
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => [],
        readCredentials: () => {
          throw new Error('StorageNotInitialized')
        },
        hasHardwareKey: () => false,
      }),
    ).toEqual({
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: false,
    })
  })

  test('readCutoverReissueWalletState uses stored credentials when the Ed25519 registry cannot be read', () => {
    expect(
      readCutoverReissueWalletState({
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => {
          throw new Error('StorageNotInitialized')
        },
        readCredentials: () => [
          { id: 'vc-hw-pid', type: PID_CREDENTIAL_TYPE },
          { id: 'vc-ed25519-dl', type: 'DLTDrivingLicence' },
        ],
        hasHardwareKey: (id) => id === 'vc-hw-pid',
      }),
    ).toEqual({
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: true,
    })
  })

  test('readCutoverReissueWalletState ignores an expired hardware PID', () => {
    expect(
      readCutoverReissueWalletState({
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => [{ credentialId: 'vc-ed25519-dl' }],
        readCredentials: () => [
          {
            id: 'vc-hw-pid',
            type: PID_CREDENTIAL_TYPE,
            expiresAt: '2020-01-01T00:00:00.000Z',
            claims: {},
          },
          { id: 'vc-ed25519-dl', type: 'DLTDrivingLicence' },
        ],
        hasHardwareKey: (id) => id === 'vc-hw-pid',
      }),
    ).toEqual({
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: false,
    })
  })

  test('assertHardwareCutoverReissueAllowed blocks non-PID when the hardware PID is expired', () => {
    expect(() =>
      assertHardwareCutoverReissueAllowed('DLTDrivingLicence', {
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => [{ credentialId: 'vc-ed25519-pid' }],
        readCredentials: () => [
          {
            id: 'vc-hw-pid',
            type: PID_CREDENTIAL_TYPE,
            expiresAt: '2020-01-01T00:00:00.000Z',
            claims: {},
          },
        ],
        hasHardwareKey: (id) => id === 'vc-hw-pid',
      }),
    ).toThrow('Reissue your national ID')
  })

  test('readCutoverReissueWalletState ignores a revoked hardware PID', () => {
    jest.mocked(readCredentialLifecycleStatus).mockImplementation((credentialId) =>
      credentialId === 'vc-hw-pid'
        ? {
            credentialId,
            action: 'Revoke',
            status: 'revoked',
            occurredAt: '2020-01-01T00:00:00.000Z',
          }
        : undefined,
    )

    expect(
      readCutoverReissueWalletState({
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => [{ credentialId: 'vc-ed25519-dl' }],
        readCredentials: () => [
          { id: 'vc-hw-pid', type: PID_CREDENTIAL_TYPE },
          { id: 'vc-ed25519-dl', type: 'DLTDrivingLicence' },
        ],
        hasHardwareKey: (id) => id === 'vc-hw-pid',
      }),
    ).toEqual({
      hasLegacyEd25519Credentials: true,
      hasHardwarePidCredential: false,
    })
  })

  test('assertHardwareCutoverReissueAllowed is a no-op when hardware P-256 is off', () => {
    expect(() =>
      assertHardwareCutoverReissueAllowed('DLTDrivingLicence', {
        ...legacyCutoverReaders,
        isHardwareEnabled: () => false,
      }),
    ).not.toThrow()
  })

  test('assertHardwareCutoverReissueAllowed blocks non-PID reissue until a hardware PID exists', () => {
    expect(() =>
      assertHardwareCutoverReissueAllowed('DLTDrivingLicence', legacyCutoverReaders),
    ).toThrow('Reissue your national ID')
  })

  test('assertHardwareCutoverReissueAllowed still allows PID reissue during cutover', () => {
    expect(() =>
      assertHardwareCutoverReissueAllowed(PID_CREDENTIAL_TYPE, legacyCutoverReaders),
    ).not.toThrow()
  })

  test('assertHardwareCutoverReissueAllowed allows non-PID reissue after a hardware PID exists', () => {
    expect(() =>
      assertHardwareCutoverReissueAllowed('ChulalongkornUniversityTranscript', {
        isHardwareEnabled: () => true,
        listLegacyEd25519Keys: () => [{ credentialId: 'vc-ed25519-pid' }],
        readCredentials: () => [{ id: 'vc-hw-pid', type: PID_CREDENTIAL_TYPE }],
        hasHardwareKey: (id) => id === 'vc-hw-pid',
      }),
    ).not.toThrow()
  })

  test('resolveCutoverCredentialTypeFromOffer maps PID, driving licence, and transcript offers', () => {
    expect(
      resolveCutoverCredentialTypeFromOffer({
        credentialConfigurations: [{ id: 'ThaiNationalID' }],
      }),
    ).toBe(PID_CREDENTIAL_TYPE)
    expect(
      resolveCutoverCredentialTypeFromOffer({
        credentialConfigurations: [{ id: 'Iso18013DriversLicenseCredential_dc+sd-jwt' }],
      }),
    ).toBe('DLTDrivingLicence')
    expect(
      resolveCutoverCredentialTypeFromOffer({
        credentialConfigurations: [{ id: 'TranscriptCredential_dc+sd-jwt' }],
      }),
    ).toBe('ChulalongkornUniversityTranscript')
  })

  test('assertHardwareCutoverReissueAllowedForOffer blocks a driving-licence offer during cutover', () => {
    expect(() =>
      assertHardwareCutoverReissueAllowedForOffer(
        { credentialConfigurations: [{ id: 'Iso18013DriversLicenseCredential_dc+sd-jwt' }] },
        legacyCutoverReaders,
      ),
    ).toThrow('Reissue your national ID')
  })

  test('assertHardwareCutoverLegacyRenewalBlocked is a no-op when hardware P-256 is off', () => {
    expect(() =>
      assertHardwareCutoverLegacyRenewalBlocked({ isHardwareEnabled: () => false }),
    ).not.toThrow()
  })

  test('assertHardwareCutoverLegacyRenewalBlocked rejects old-key renewal when hardware P-256 is on', () => {
    expect(() =>
      assertHardwareCutoverLegacyRenewalBlocked({ isHardwareEnabled: () => true }),
    ).toThrow('Legacy key renewal presentation is unsupported')
  })
})
