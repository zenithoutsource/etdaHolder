import { canShowNfcPresentButton, isMdocRawVc } from './mdocCredential'

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
})
