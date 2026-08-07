import { useSameDeviceIssuanceStore } from '../../store/sameDeviceIssuanceStore'
import type { Oid4vcVciAdapterContext } from '../vci/oid4vc/types'
import { parseIssuanceCallbackUrl } from './parseIssuanceCallbackUrl'

jest.mock('../vci/oid4vc/authorizationCodeViaOid4vc', () => ({
  parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc: jest.fn(),
}))

const { parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc } = jest.requireMock(
  '../vci/oid4vc/authorizationCodeViaOid4vc',
) as {
  parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc: jest.Mock
}

function makeAuthCodeOid4vcContext(): Oid4vcVciAdapterContext {
  const issuer = 'https://issuer.example.com'
  return {
    credentialOfferObject: {
      credential_issuer: issuer,
      credential_configuration_ids: ['ThaiNationalID'],
      grants: { authorization_code: {} },
    },
    issuerMetadataResult: {
      credentialIssuer: { credential_issuer: issuer },
      credentialEndpoint: `${issuer}/credential`,
      authorizationServers: [{ issuer, token_endpoint: `${issuer}/token` }],
    } as unknown as Oid4vcVciAdapterContext['issuerMetadataResult'],
  }
}

describe('parseIssuanceCallbackUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useSameDeviceIssuanceStore.setState({ session: null })
  })
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

  test('accepts a trailing slash on the callback path', () => {
    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback/?credential_offer_uri=http%3A%2F%2Fissuer.local%2Foffer',
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

  test('parses OAuth authorization code from walletapp callback', () => {
    expect(
      parseIssuanceCallbackUrl('walletapp://callback?code=SplxlOBeZQQ', 'walletapp://callback'),
    ).toEqual({
      kind: 'authorization_code',
      code: 'SplxlOBeZQQ',
    })
  })

  test('parses OAuth authorization error from walletapp callback', () => {
    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback?error=access_denied&error_description=User%20denied',
        'walletapp://callback',
      ),
    ).toEqual({
      kind: 'authorization_error',
      error: 'access_denied',
      errorDescription: 'User denied',
    })
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

  test('uses parseAndVerify when same-device session has oid4vc context', () => {
    const oid4vcContext = makeAuthCodeOid4vcContext()
    useSameDeviceIssuanceStore.setState({
      session: {
        id: 'session-verify',
        credentialType: 'ThaiNationalID',
        phase: 'portal',
        codeVerifier: 'verifier',
        redirectUri: 'walletapp://callback',
        resolvedOffer: {
          offerUri: 'same-device-authorization-code://local',
          issuer: 'https://issuer.example.com',
          credentialConfigurations: [],
          supportedFlows: ['authorization_code'],
          oid4vcContext,
        } as never,
      },
    })

    parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc.mockReturnValue({
      code: 'verified-code',
      state: 'session-verify',
      iss: 'https://issuer.example.com',
    })

    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback?code=verified-code&state=session-verify&iss=https%3A%2F%2Fissuer.example.com',
        'walletapp://callback',
      ),
    ).toEqual({
      kind: 'authorization_code',
      code: 'verified-code',
      state: 'session-verify',
    })

    expect(parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc).toHaveBeenCalledWith({
      url: 'walletapp://callback?code=verified-code&state=session-verify&iss=https%3A%2F%2Fissuer.example.com',
      oid4vcContext,
    })
  })

  test('returns authorization_error when verified OAuth state mismatches session', () => {
    const oid4vcContext = makeAuthCodeOid4vcContext()
    useSameDeviceIssuanceStore.setState({
      session: {
        id: 'session-expected',
        credentialType: 'ThaiNationalID',
        phase: 'portal',
        codeVerifier: 'verifier',
        redirectUri: 'walletapp://callback',
        resolvedOffer: { oid4vcContext } as never,
      },
    })

    parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc.mockReturnValue({
      code: 'verified-code',
      state: 'wrong-state',
    })

    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback?code=verified-code&state=wrong-state',
        'walletapp://callback',
      ),
    ).toEqual({
      kind: 'authorization_error',
      error: 'invalid_state',
      state: 'wrong-state',
    })
  })

  test('falls back to unverified parse when verify throws', () => {
    const oid4vcContext = makeAuthCodeOid4vcContext()
    parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc.mockImplementation(() => {
      throw new Error('iss mismatch')
    })

    expect(
      parseIssuanceCallbackUrl(
        'walletapp://callback?code=SplxlOBeZQQ',
        'walletapp://callback',
        { oid4vcContext },
      ),
    ).toEqual({
      kind: 'authorization_code',
      code: 'SplxlOBeZQQ',
    })
  })

  test('falls back to unverified parse when same-device session lacks oid4vc context', () => {
    useSameDeviceIssuanceStore.setState({
      session: {
        id: 'session-no-context',
        credentialType: 'ThaiNationalID',
        phase: 'portal',
        codeVerifier: 'verifier',
        redirectUri: 'walletapp://callback',
      },
    })

    expect(
      parseIssuanceCallbackUrl('walletapp://callback?code=SplxlOBeZQQ', 'walletapp://callback'),
    ).toEqual({
      kind: 'authorization_code',
      code: 'SplxlOBeZQQ',
    })
    expect(parseAndVerifyAuthorizationResponseRedirectUrlViaOid4vc).not.toHaveBeenCalled()
  })
})
