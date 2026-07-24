import { parseIssuanceCallbackUrl } from './parseIssuanceCallbackUrl'

describe('parseIssuanceCallbackUrl', () => {
  test('parses credential offer deeplink directly', () => {
    const offer = 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer'
    expect(parseIssuanceCallbackUrl(offer)).toEqual({ kind: 'credential_offer', uri: offer })
  })

  test('parses offer URI from walletapp callback query', () => {
    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer',
        'walletapp://callback',
      ),
    ).toEqual({
      kind: 'credential_offer',
      uri: 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer',
    })
  })

  test('wraps https offer URL from callback query', () => {
    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback?uri=http%3A%2F%2Fissuer.local%2Foffer',
        'walletapp://callback',
      ),
    ).toEqual({
      kind: 'credential_offer',
      uri: 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer',
    })
  })

  test('rejects callback without offer URI', () => {
    expect(
      parseIssuanceCallbackUrl('walletapp://callback?code=SplxlOBeZQQ', 'walletapp://callback'),
    ).toEqual({ kind: 'unsupported' })
  })

  test('parses authorization_request_uri from walletapp callback', () => {
    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback?authorization_request_uri=https%3A%2F%2Fverifier.example%2Frequest%2Fabc',
        'walletapp://callback',
      ),
    ).toEqual({
      kind: 'presentation_request',
      uri: 'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Frequest%2Fabc',
    })
  })

  test('parses embedded openid4vp quirk when query starts with openid4vp scheme', () => {
    const embedded =
      'openid4vp://authorize?client_id=redirect_uri:https%3A%2F%2Fverifier.example%2Fverify%2Fabc&request_uri=https%3A%2F%2Fverifier.example%2Frequest%2Fabc'
    expect(
      parseIssuanceCallbackUrl(`walletapp://callback?${embedded}`, 'walletapp://callback'),
    ).toEqual({
      kind: 'presentation_request',
      uri: embedded,
    })
  })

  test('parses verifier quirk with unencoded openid4vp query prefix', () => {
    const callback =
      'walletapp://callback?openid4vp://authorize?client_id=redirect_uri:https%3A%2F%2Fverifier.zenithcomp.co.th%3A455%2Fopenid4vc%2Fverify%2Fabc&request_uri=https%3A%2F%2Fverifier.zenithcomp.co.th%3A455%2Fopenid4vc%2Frequest%2Fabc'
    expect(parseIssuanceCallbackUrl(callback, 'walletapp://callback')).toEqual({
      kind: 'presentation_request',
      uri:
        'openid4vp://authorize?client_id=redirect_uri:https%3A%2F%2Fverifier.zenithcomp.co.th%3A455%2Fopenid4vc%2Fverify%2Fabc&request_uri=https%3A%2F%2Fverifier.zenithcomp.co.th%3A455%2Fopenid4vc%2Frequest%2Fabc',
    })
  })

  test('accepts nested openid-credential-offer in credential_offer_uri query', () => {
    const nested = 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer'
    expect(
      parseIssuanceCallbackUrl(
        `walletapp://callback?credential_offer_uri=${encodeURIComponent(nested)}`,
        'walletapp://callback',
      ),
    ).toEqual({ kind: 'credential_offer', uri: nested })
  })

  test('accepts issuer redirect that uses openid-credential-offer as query key', () => {
    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback?openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3Dc3713dbe-8ee7-4149-abd7-a284e5f9d7ca',
        'walletapp://callback',
      ),
    ).toEqual({
      kind: 'credential_offer',
      uri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3Dc3713dbe-8ee7-4149-abd7-a284e5f9d7ca',
    })
  })
})
