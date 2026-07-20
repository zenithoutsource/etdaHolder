import { saveCredentialRecord, type VerifiableCredentialRecord } from '../vci/exchangeService'
import { getCredentialStorage } from '../storage/storage'
import { readCredentialIssuerName } from './credentialIssuer'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
  getMetaStorage: jest.fn(() => ({
    getString: () => undefined,
    set: () => undefined,
    remove: () => undefined,
  })),
}))

function record(overrides: Partial<VerifiableCredentialRecord> = {}): VerifiableCredentialRecord {
  return {
    id: 'transcript-1',
    type: 'BangkokUniversityTranscript',
    rawVc: 'header.payload.signature',
    claims: {},
    issuedAt: '2026-07-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('credential issuer name', () => {
  test('prefers the issuer display name captured from metadata', () => {
    expect(readCredentialIssuerName(record({ type: 'OtherCredential', issuerName: 'Issuer University' }))).toBe(
      'Issuer University',
    )
  })

  test('falls back to the issuer claim for legacy records', () => {
    expect(
      readCredentialIssuerName(
        record({ type: 'OtherCredential', claims: { iss: 'https://issuer.example' } }),
      ),
    ).toBe('https://issuer.example')
  })

  test('uses the configured transcript issuer fallback instead of the issuer URL', () => {
    expect(
      readCredentialIssuerName(
        record({
          claims: { iss: 'https://issuer.zenithcomp.co.th:455' },
        }),
      ),
    ).toBe('Chulalongkorn University')
  })

  test.each([
    ['ThaiNationalID', 'Department of Provincial Administration'],
    ['DLTDrivingLicence', 'Department of Land Transport'],
    ['BangkokUniversityTranscript', 'Chulalongkorn University'],
  ])('uses the configured issuer name for %s', (type, expectedName) => {
    expect(
      readCredentialIssuerName(
        record({
          type,
          issuerName: 'Issuer Metadata Name',
          claims: { iss: 'https://issuer.example' },
        }),
      ),
    ).toBe(expectedName)
  })

  test('uses a generic unknown label only when no issuer value exists', () => {
    expect(readCredentialIssuerName(record({ type: 'OtherCredential' }))).toBe('Unknown Issuer')
  })

  test('writes the issuer name to the credential-received history event', () => {
    const writes = new Map<string, string>()
    const storage = {
      getString: (key: string) => writes.get(key),
      set: (key: string, value: string) => writes.set(key, value),
      remove: () => true,
    }
    jest.mocked(getCredentialStorage).mockReturnValue(storage as never)

    saveCredentialRecord(record({ issuerName: 'Issuer University' }), {
      getCredentialStorage: () => storage,
    })

    const historyEvent = [...writes.entries()]
      .filter(([key]) => key.startsWith('wallet:history:event:'))
      .map(([, value]) => JSON.parse(value) as { partyName: string })[0]

    expect(historyEvent.partyName).toBe('Chulalongkorn University')
  })
})
