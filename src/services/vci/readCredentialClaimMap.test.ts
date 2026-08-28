import { createHash } from 'react-native-quick-crypto'

import { readCredentialClaimMap, type VerifiableCredentialRecord } from './exchangeService'

function encodeDisclosure(value: unknown[]): string {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function digest(segment: string): string {
  return createHash('sha256').update(segment, 'latin1').digest('base64url')
}

function base64UrlEncodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function unsignedJwt(payload: Record<string, unknown>): string {
  return `${base64UrlEncodeJson({ alg: 'none' })}.${base64UrlEncodeJson(payload)}.signature`
}

describe('readCredentialClaimMap', () => {
  test('prefers freshly decoded nested SD-JWT claims over stale stored claims', () => {
    const category = encodeDisclosure(['salt-cat', 'vehicle_category_code', 'B'])
    const issueDate = encodeDisclosure([
      'salt-issue',
      'issue_date',
      { __tag: 1004, value: '2026-08-20' },
    ])
    const expiryDate = encodeDisclosure([
      'salt-exp',
      'expiry_date',
      { __tag: 1004, value: '2031-08-19' },
    ])
    const row = encodeDisclosure([
      'salt-row',
      {
        _sd: [digest(category), digest(issueDate), digest(expiryDate)],
      },
    ])
    const privileges = encodeDisclosure([
      'salt-dp',
      'driving_privileges',
      [{ '...': digest(row) }],
    ])

    const rawVc = [
      unsignedJwt({
        vct: 'https://demo.tonyhere.work/credentials/DrivingLicense',
        _sd_alg: 'sha-256',
        _sd: [digest(privileges)],
      }),
      category,
      issueDate,
      expiryDate,
      row,
      privileges,
      '',
    ].join('~')

    const record: VerifiableCredentialRecord = {
      id: 'dl-1',
      type: 'DrivingLicense',
      rawVc,
      claims: {
        driving_privileges: [{ vehicle_category_code: 'B' }],
        given_name: 'Ada',
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(readCredentialClaimMap(record).driving_privileges).toEqual([
      {
        vehicle_category_code: 'B',
        issue_date: { __tag: 1004, value: '2026-08-20' },
        expiry_date: { __tag: 1004, value: '2031-08-19' },
      },
    ])
  })

  test('keeps stored overlay claims that are not present in the decoded payload', () => {
    const rawVc = [
      unsignedJwt({ vct: 'urn:example:idcard', _sd_alg: 'sha-256' }),
      encodeDisclosure(['salt', 'given_name', 'Ada']),
      '',
    ].join('~')

    const record: VerifiableCredentialRecord = {
      id: 'id-1',
      type: 'ThaiNationalID',
      rawVc,
      claims: {
        portrait: 'https://example.com/portrait.jpg',
        given_name: 'Stale',
      },
      issuedAt: '2026-01-01T00:00:00.000Z',
    }

    expect(readCredentialClaimMap(record)).toMatchObject({
      portrait: 'https://example.com/portrait.jpg',
      given_name: 'Ada',
      vct: 'urn:example:idcard',
    })
  })
})
