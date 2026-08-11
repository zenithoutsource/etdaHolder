import {
  PID_CREDENTIAL_TYPE,
  assessCutoverReissueGate,
  assertCutoverReissueAllowed,
  rejectLegacyKeyRenewalPresentation,
} from './cutoverMigrationPolicy'

describe('cutoverMigrationPolicy', () => {
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
})
