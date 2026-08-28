import type { VerifiableCredentialRecord } from '../vci/exchangeService'
import {
  findSupersededOldCredentialForDisplay,
  isCredentialSupersededByNewerSibling,
} from './credentialSupersededSibling'

const issuer = 'https://issuer.zenithcomp.co.th:455/'

function record(
  id: string,
  issuedAt: string,
  overrides: Partial<VerifiableCredentialRecord> = {},
): VerifiableCredentialRecord {
  return {
    id,
    type: 'ChulalongkornUniversityTranscript',
    rawVc: `vc-${id}`,
    claims: {},
    issuedAt,
    issuerUrl: issuer,
    ...overrides,
  }
}

describe('credentialSupersededSibling', () => {
  test('returns older active sibling when preferred is newer', () => {
    const old = record('old', '2026-01-01T00:00:00.000Z')
    const newer = record('new', '2026-08-24T00:00:00.000Z')
    const result = findSupersededOldCredentialForDisplay({
      preferredCredential: newer,
      credentials: [old, newer],
      renewalStatuses: {},
    })
    expect(result).toEqual({ oldCredentialId: 'old' })
  })

  test('does not return calendar-expired old sibling', () => {
    const expired = record('old', '2020-01-01T00:00:00.000Z', {
      expiresAt: '2020-06-01T00:00:00.000Z',
    })
    const newer = record('new', '2026-08-24T00:00:00.000Z')
    const result = findSupersededOldCredentialForDisplay({
      preferredCredential: newer,
      credentials: [expired, newer],
      renewalStatuses: {},
    })
    expect(result).toBeUndefined()
  })

  test('isCredentialSupersededByNewerSibling is true for old record', () => {
    const old = record('old', '2026-01-01T00:00:00.000Z')
    const newer = record('new', '2026-08-24T00:00:00.000Z')
    expect(isCredentialSupersededByNewerSibling('old', [old, newer], {})).toBe(true)
  })

  test('does not link first-party and third-party DLT families', () => {
    const firstParty = record('fp-old', '2026-01-01T00:00:00.000Z', {
      type: 'DLTDrivingLicence',
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
    })
    const thirdParty = record('tp-new', '2026-08-24T00:00:00.000Z', {
      type: 'org.iso.18013.5.1.mDL',
      issuerUrl: 'https://demo.tonyhere.work/',
      claims: { doctype: 'org.iso.18013.5.1.mDL' },
      credentialConfigurationId: 'org.iso.18013.5.1.mDL',
    })
    const result = findSupersededOldCredentialForDisplay({
      preferredCredential: thirdParty,
      credentials: [firstParty, thirdParty],
      renewalStatuses: {},
    })
    expect(result).toBeUndefined()
  })
})
