import { resolvePresentationRequestUri } from './resolvePresentationRequestUri'

describe('resolvePresentationRequestUri', () => {
  test('returns direct openid4vp authorize URI unchanged', () => {
    const uri =
      'openid4vp://authorize?client_id=redirect_uri:https%3A%2F%2Fverifier.example%2Fverify%2Fid&request_uri=https%3A%2F%2Fverifier.example%2Frequest%2Fid'
    expect(resolvePresentationRequestUri(uri)).toBe(uri)
  })

  test('normalizes walletapp callback with embedded openid4vp query', () => {
    const embedded =
      'openid4vp://authorize?client_id=x&request_uri=https%3A%2F%2Fverifier.example%2Frequest%2Fid'
    expect(
      resolvePresentationRequestUri(`walletapp://callback?${embedded}`),
    ).toBe(embedded)
  })

  test('returns null for unrelated URLs', () => {
    expect(resolvePresentationRequestUri('walletapp://callback?credential_offer_uri=x')).toBeNull()
    expect(resolvePresentationRequestUri(null)).toBeNull()
  })
})
