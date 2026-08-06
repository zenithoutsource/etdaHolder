import { redirectIssuanceCallbackPath, redirectWalletSystemPath } from './redirectIssuanceCallbackPath'

describe('redirectIssuanceCallbackPath', () => {
  test('rewrites walletapp://callback with query to /callback route', () => {
    expect(
      redirectIssuanceCallbackPath(
        'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
      ),
    ).toBe('/callback?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer')
  })

  test('rewrites walletapp://callback without query', () => {
    expect(redirectIssuanceCallbackPath('walletapp://callback')).toBe('/callback')
  })

  test('passes through unrelated paths', () => {
    expect(
      redirectIssuanceCallbackPath(
        'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fx',
      ),
    ).toBe('openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fx')
  })
})

describe('redirectWalletSystemPath', () => {
  test('rewrites openid4vp authorize deeplink to presentation-request route', () => {
    expect(
      redirectWalletSystemPath(
        'openid4vp://authorize?client_id=redirect_uri:https%3A%2F%2Fverifier.example%2Fverify%2Fid&request_uri=https%3A%2F%2Fverifier.example%2Frequest%2Fid',
      ),
    ).toBe('/(tabs)/presentation-request')
  })

  test('still rewrites walletapp callback before openid4vp check', () => {
    expect(redirectWalletSystemPath('walletapp://callback?authorization_request_uri=x')).toBe(
      '/callback?authorization_request_uri=x',
    )
  })
})
