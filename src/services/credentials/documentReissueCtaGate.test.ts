import { shouldOfferDocumentReissueCta } from './documentReissueCtaGate'

describe('shouldOfferDocumentReissueCta', () => {
  test('defers document reissue while create-key lane is active', () => {
    expect(
      shouldOfferDocumentReissueCta({ lane: 'create-key', documentExpired: true }),
    ).toBe(false)
  })

  test('offers document reissue when idle and document is expired', () => {
    expect(
      shouldOfferDocumentReissueCta({ lane: 'idle', documentExpired: true }),
    ).toBe(true)
  })

  test('offers document reissue when finish-renewals lane and document is expired', () => {
    expect(
      shouldOfferDocumentReissueCta({
        lane: 'finish-renewals',
        documentExpired: true,
      }),
    ).toBe(true)
  })

  test('does not offer document reissue when document is not expired', () => {
    expect(
      shouldOfferDocumentReissueCta({ lane: 'idle', documentExpired: false }),
    ).toBe(false)
    expect(
      shouldOfferDocumentReissueCta({
        lane: 'create-key',
        documentExpired: false,
      }),
    ).toBe(false)
  })
})
