import { redirectIssuanceCallbackPath } from './redirectIssuanceCallbackPath'

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
