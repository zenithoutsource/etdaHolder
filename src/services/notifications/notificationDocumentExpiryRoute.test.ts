import { isStaleDocumentExpiryNotification } from './notificationDocumentExpiryRoute'
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

const thaiIdCredential: VerifiableCredentialRecord = {
  id: 'credential-1',
  type: 'ThaiNationalID',
  rawVc: 'vc',
  claims: {
    expiryDate: '11 มิถุนายน 2575',
    exp: Math.floor(new Date('2032-05-11T00:00:00.000Z').getTime() / 1000),
  },
  issuedAt: '2026-01-01T00:00:00.000Z',
  expiresAt: '2032-05-11T00:00:00.000Z',
}

describe('notificationDocumentExpiryRoute', () => {
  test('flags stale document-expired taps when the credential is still active', () => {
    expect(
      isStaleDocumentExpiryNotification({
        notificationEvent: 'document-expired',
        credential: thaiIdCredential,
        now: new Date('2032-05-12T12:00:00+07:00'),
      }),
    ).toBe(true)
  })

  test('does not flag document-expired taps when the credential is actually expired', () => {
    expect(
      isStaleDocumentExpiryNotification({
        notificationEvent: 'document-expired',
        credential: thaiIdCredential,
        now: new Date('2032-06-12T12:00:00+07:00'),
      }),
    ).toBe(false)
  })

  test('flags stale document-expiring-soon taps when the credential is not in the warning window', () => {
    expect(
      isStaleDocumentExpiryNotification({
        notificationEvent: 'document-expiring-soon',
        credential: thaiIdCredential,
        now: new Date('2032-05-01T12:00:00+07:00'),
      }),
    ).toBe(true)
  })

  test('does not flag document-expiring-soon taps when the credential is in the warning window', () => {
    expect(
      isStaleDocumentExpiryNotification({
        notificationEvent: 'document-expiring-soon',
        credential: thaiIdCredential,
        now: new Date('2032-05-12T12:00:00+07:00'),
      }),
    ).toBe(false)
  })
})
