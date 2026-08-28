import {
  canShowNfcPresentButton,
  isMdocPresentableRecord,
  isMdocRawVc,
  readMdocDocTypeFromRecord,
} from './mdocCredential'

jest.mock('../credentials/logicalCredentialStorage', () => ({
  ...jest.requireActual('../credentials/logicalCredentialStorage'),
  recordHasLogicalMdocFormat: jest.fn(() => false),
}))

import { recordHasLogicalMdocFormat } from '../credentials/logicalCredentialStorage'

const mockRecordHasLogicalMdocFormat = jest.mocked(recordHasLogicalMdocFormat)

describe('mdocCredential NFC visibility', () => {
  test('shows NFC on Android when rawVc is an mdoc payload', () => {
    expect(
      canShowNfcPresentButton({
        record: { rawVc: 'mdoc:abc' },
        hasNativeMdoc: false,
        renewalBlocked: false,
        platform: 'android',
      }),
    ).toBe(true)
  })

  test('shows NFC on Android when native mdoc is stored', () => {
    expect(
      canShowNfcPresentButton({
        record: { rawVc: 'eyJhbGciOiJFZERTQSJ9.e30.sig' },
        hasNativeMdoc: true,
        renewalBlocked: false,
        platform: 'android',
      }),
    ).toBe(true)
  })

  test('hides NFC when renewal is blocked', () => {
    expect(
      canShowNfcPresentButton({
        record: { rawVc: 'mdoc:abc' },
        hasNativeMdoc: true,
        renewalBlocked: true,
        platform: 'android',
      }),
    ).toBe(false)
  })

  test('hides NFC for an unregistered credential even when native mdoc exists', () => {
    expect(
      canShowNfcPresentButton({
        record: {
          rawVc: 'eyJhbGciOiJFZERTQSJ9.e30.sig',
          type: 'DLTDrivingLicence',
          claims: { vct: 'urn:tonyhere:demo:pid-age:1' },
          credentialConfigurationId: 'urn:tonyhere:demo:pid-age:1',
        },
        hasNativeMdoc: true,
        renewalBlocked: false,
        platform: 'android',
      }),
    ).toBe(false)
  })

  test('hides NFC off Android', () => {
    expect(
      canShowNfcPresentButton({
        record: { rawVc: 'mdoc:abc' },
        hasNativeMdoc: true,
        renewalBlocked: false,
        platform: 'ios',
      }),
    ).toBe(false)
  })

  test('isMdocRawVc requires the mdoc prefix', () => {
    expect(isMdocRawVc('mdoc:abc')).toBe(true)
    expect(isMdocRawVc('openid-credential-offer://x')).toBe(false)
    expect(isMdocRawVc(undefined)).toBe(false)
  })

  test('isMdocPresentableRecord accepts dual-format SD-JWT records linked to logical mso_mdoc', () => {
    mockRecordHasLogicalMdocFormat.mockReturnValueOnce(true)
    expect(
      isMdocPresentableRecord({
        id: 'dual-format-dlt-1',
        rawVc: 'issuer.sd.jwt~disclosure~',
        claims: {},
      }),
    ).toBe(true)
  })

  test('readMdocDocTypeFromRecord defaults dual-format DLT to org.iso.18013.5.1.mDL', () => {
    expect(
      readMdocDocTypeFromRecord({
        id: 'dual-format-dlt-1',
        type: 'DLTDrivingLicence',
        rawVc: 'issuer.sd.jwt~disclosure~',
        claims: { givenName: 'Ada' },
      }),
    ).toBe('org.iso.18013.5.1.mDL')
  })

  test('readMdocDocTypeFromRecord does not default non-mdoc ThaiNationalID to mDL', () => {
    expect(
      readMdocDocTypeFromRecord({
        id: 'thai-id-1',
        type: 'ThaiNationalID',
        rawVc: 'issuer.sd.jwt~disclosure~',
        claims: { givenName: 'Ada' },
      }),
    ).toBe('unknown')
  })
})
