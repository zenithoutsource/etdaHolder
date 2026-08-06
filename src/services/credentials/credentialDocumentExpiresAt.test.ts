import {
  parseThaiBuddhistDate,
  readCredentialDocumentExpiresAt,
  readDocumentExpiryFromClaims,
  readNormalizedDocumentExpiry,
} from './credentialDocumentExpiresAt'
import {
  isCredentialDocumentExpired,
  readCredentialExpiryPhase,
} from './credentialDocumentExpiry'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

describe('credentialDocumentExpiresAt', () => {
  test('parses Thai Buddhist expiry dates shown on ID cards', () => {
    expect(parseThaiBuddhistDate('11 มิถุนายน 2575')).toBe('2032-06-11T00:00:00.000Z')
    expect(parseThaiBuddhistDate('11 มิ.ย. 2575')).toBe('2032-06-11T00:00:00.000Z')
    expect(parseThaiBuddhistDate('28 พฤศจิกายน 2573')).toBe('2030-11-28T00:00:00.000Z')
  })

  test('prefers Thai claim expiry over stored JWT exp-based expiresAt', () => {
    const record: VerifiableCredentialRecord = {
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

    expect(readCredentialDocumentExpiresAt(record)).toBe('2032-06-11T00:00:00.000Z')
    expect(
      readCredentialExpiryPhase(record, new Date('2032-05-11T12:00:00+07:00')),
    ).toBe('active')
    expect(isCredentialDocumentExpired(record, new Date('2032-05-11T12:00:00+07:00'))).toBe(
      false,
    )
  })

  test('prefers document expiry claims over stored JWT exp-based expiresAt', () => {
    const record: VerifiableCredentialRecord = {
      id: 'credential-1',
      type: 'ThaiNationalID',
      rawVc: 'vc',
      claims: {
        expiry_date: '2032-06-11',
        exp: Math.floor(new Date('2032-05-11T00:00:00.000Z').getTime() / 1000),
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2032-05-11T00:00:00.000Z',
    }

    expect(readCredentialDocumentExpiresAt(record)).toBe('2032-06-11T00:00:00.000Z')
    expect(
      readCredentialExpiryPhase(record, new Date('2032-05-11T12:00:00+07:00')),
    ).toBe('active')
    expect(isCredentialDocumentExpired(record, new Date('2032-05-11T12:00:00+07:00'))).toBe(
      false,
    )
  })

  test('normalizes new credentials with Thai claim expiry before JWT exp', () => {
    expect(
      readNormalizedDocumentExpiry({
        type: 'ThaiNationalID',
        claims: {
          expiryDate: '11 มิ.ย. 2575',
          exp: Math.floor(new Date('2032-05-11T00:00:00.000Z').getTime() / 1000),
        },
      }),
    ).toBe('2032-06-11T00:00:00.000Z')
  })

  test('normalizes new credentials with claim expiry before JWT exp', () => {
    expect(
      readNormalizedDocumentExpiry({
        claims: {
          expiry_date: '2032-06-11',
          exp: Math.floor(new Date('2032-05-11T00:00:00.000Z').getTime() / 1000),
        },
      }),
    ).toBe('2032-06-11T00:00:00.000Z')
  })

  test('falls back to JWT exp when no document expiry claim exists', () => {
    const exp = Math.floor(new Date('2032-06-11T00:00:00.000Z').getTime() / 1000)

    expect(readDocumentExpiryFromClaims({})).toBeUndefined()
    expect(readNormalizedDocumentExpiry({ claims: {}, jwtExp: exp })).toBe(
      '2032-06-11T00:00:00.000Z',
    )
  })
})
