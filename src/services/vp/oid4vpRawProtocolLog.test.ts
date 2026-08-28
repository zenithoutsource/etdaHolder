import { logOid4vpRawPresentationSubmit, isOid4vpPresentationWireBody } from './oid4vpRawProtocolLog'
import { logWalletRawProtocol } from '../debug/walletLogger'

jest.mock('../debug/walletLogger', () => ({
  logWalletRawProtocol: jest.fn(),
}))

describe('oid4vpRawProtocolLog', () => {
  const logWalletRawProtocolMock = logWalletRawProtocol as jest.Mock

  beforeEach(() => {
    logWalletRawProtocolMock.mockClear()
  })

  test('isOid4vpPresentationWireBody detects direct_post and direct_post.jwt bodies', () => {
    expect(isOid4vpPresentationWireBody('response=eyJhbGciOiJFQ0RILUVTIn0')).toBe(true)
    expect(isOid4vpPresentationWireBody('vp_token=abc&state=xyz')).toBe(true)
    expect(isOid4vpPresentationWireBody('grant_type=client_credentials')).toBe(false)
  })

  test('logOid4vpRawPresentationSubmit emits a single consolidated raw event', () => {
    logOid4vpRawPresentationSubmit({
      responseUri: 'https://verifier.example/response',
      responseMode: 'direct_post.jwt',
      vpToken: '{"q":["sd-jwt"]}',
      wireBody: 'response=jwe',
    })
    expect(logWalletRawProtocolMock).toHaveBeenCalledWith('oid4vp', 'debug-raw-presentation-submit', {
      responseUri: 'https://verifier.example/response',
      responseMode: 'direct_post.jwt',
      vpToken: '{"q":["sd-jwt"]}',
      wireBody: 'response=jwe',
    })
  })
})
