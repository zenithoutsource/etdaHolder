import { createHash } from 'react-native-quick-crypto'

import { decodeSdJwtDisclosedClaims } from './sdJwtClaimDecode'

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

describe('sdJwtClaimDecode', () => {
  test('keeps flat SD-JWT disclosures working when issuer payload has no _sd digests', () => {
    const compact = [
      unsignedJwt({ vct: 'https://issuer.example/vct/transcript', _sd_alg: 'sha-256' }),
      encodeDisclosure(['salt-given', 'given_name', 'Ada']),
      encodeDisclosure(['salt-family', 'family_name', 'Lovelace']),
      '',
    ].join('~')

    expect(decodeSdJwtDisclosedClaims(compact)).toEqual({
      vct: 'https://issuer.example/vct/transcript',
      given_name: 'Ada',
      family_name: 'Lovelace',
    })
  })

  test('decodes nested driving_privileges arrays with object and array SD digests', () => {
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

    const compact = [
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

    expect(decodeSdJwtDisclosedClaims(compact)).toEqual({
      vct: 'https://demo.tonyhere.work/credentials/DrivingLicense',
      driving_privileges: [
        {
          vehicle_category_code: 'B',
          issue_date: { __tag: 1004, value: '2026-08-20' },
          expiry_date: { __tag: 1004, value: '2031-08-19' },
        },
      ],
    })
  })
})
