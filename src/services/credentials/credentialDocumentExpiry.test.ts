import {
  findExpiredCredentialsOfSameType,
  isCredentialDocumentExpired,
  isCredentialExpiringSoon,
  readCredentialExpiryPhase,
  readMsUntilDocumentExpiry,
} from './credentialDocumentExpiry'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

function buildRecord(expiresAt?: string): VerifiableCredentialRecord {
  return {
    id: 'credential-1',
    type: 'ThaiNationalID',
    rawVc: 'vc',
    claims: {},
    issuedAt: '2026-01-01T00:00:00.000Z',
    ...(expiresAt ? { expiresAt } : {}),
  }
}

describe('credentialDocumentExpiry', () => {
  test('treats missing expiresAt as no-expiry', () => {
    expect(readCredentialExpiryPhase(buildRecord())).toBe('no-expiry')
    expect(isCredentialDocumentExpired(buildRecord())).toBe(false)
    expect(isCredentialExpiringSoon(buildRecord())).toBe(false)
  })

  test('marks credentials active before the expiring-soon window', () => {
    const record = buildRecord('2030-06-15T00:00:00.000Z')
    const now = new Date('2030-05-01T12:00:00.000+07:00')

    expect(readCredentialExpiryPhase(record, now)).toBe('active')
    expect(isCredentialDocumentExpired(record, now)).toBe(false)
    expect(isCredentialExpiringSoon(record, now)).toBe(false)
  })

  test('marks credentials expiring-soon within the warning window', () => {
    const record = buildRecord('2030-06-15T00:00:00.000Z')
    const now = new Date('2030-06-01T12:00:00.000+07:00')

    expect(readCredentialExpiryPhase(record, now)).toBe('expiring-soon')
    expect(isCredentialExpiringSoon(record, now)).toBe(true)
    expect(isCredentialDocumentExpired(record, now)).toBe(false)
  })

  test('expires at end of the Bangkok calendar day', () => {
    const record = buildRecord('2030-06-15T08:00:00.000Z')

    expect(
      isCredentialDocumentExpired(record, new Date('2030-06-15T16:59:59.999+07:00')),
    ).toBe(false)
    expect(
      isCredentialDocumentExpired(record, new Date('2030-06-16T00:00:00.001+07:00')),
    ).toBe(true)
  })

  test('reads milliseconds until document expiry', () => {
    const record = buildRecord('2030-06-15T00:00:00.000Z')
    const now = new Date('2030-06-14T12:00:00.000+07:00').getTime()
    const msUntilExpiry = readMsUntilDocumentExpiry(record, now)

    expect(msUntilExpiry).toBeGreaterThan(0)
    expect(msUntilExpiry).toBeLessThanOrEqual(36 * 60 * 60 * 1000)
  })

  test('finds expired credentials of the same type after a new claim', () => {
    const expired = buildRecord('2020-01-01T00:00:00.000Z')
    expired.id = 'old-id'
    const fresh = buildRecord('2035-01-01T00:00:00.000Z')
    fresh.id = 'new-id'

    expect(
      findExpiredCredentialsOfSameType(
        fresh,
        [expired, fresh],
        new Date('2026-06-01T00:00:00.000Z'),
      ),
    ).toEqual([expired])
  })

  test('P3 renewal-required precedence is handled by inactive state, not expiry phase', () => {
    const record = buildRecord('2020-01-01T00:00:00.000Z')
    expect(isCredentialDocumentExpired(record, new Date('2026-06-01T00:00:00.000Z'))).toBe(true)
  })
})
