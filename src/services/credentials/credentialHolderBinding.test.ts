import {
  isJwtLikeCredentialRaw,
  readCredentialHolderDid,
} from './credentialHolderBinding'
import type { VerifiableCredentialRecord } from '../vci/exchangeService'

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${encode({ alg: 'ES256' })}.${encode(payload)}.sig`
}

function record(rawVc: string): VerifiableCredentialRecord {
  return {
    id: 'cred-1',
    type: 'DLTDrivingLicence',
    rawVc,
    claims: {},
    issuedAt: '2026-08-21T00:00:00.000Z',
  }
}

describe('credentialHolderBinding', () => {
  test('treats mdoc and empty rawVc as non-JWT', () => {
    expect(isJwtLikeCredentialRaw('mdoc:AQIDBA')).toBe(false)
    expect(isJwtLikeCredentialRaw('')).toBe(false)
    expect(isJwtLikeCredentialRaw(unsignedJwt({ cnf: { kid: 'did:key:z' } }))).toBe(true)
  })

  test('does not throw when reading holder DID from an mdoc record', () => {
    expect(readCredentialHolderDid(record('mdoc:AQIDBA'))).toBeUndefined()
  })

  test('reads did:key from JWT cnf.kid', () => {
    const rawVc = unsignedJwt({ cnf: { kid: 'did:key:zExample#zExample' } })
    expect(readCredentialHolderDid(record(rawVc))).toBe('did:key:zExample')
  })
})
