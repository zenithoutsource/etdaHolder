import {
  clientIdRequiresSignedRequestObject,
  parseClientId,
  readDidWebHttpsOrigin,
  readResponseUriMatchesClientId,
} from './clientIdScheme'

describe('clientIdScheme', () => {
  test('parses redirect_uri and decentralized_identifier prefixes', () => {
    expect(parseClientId('redirect_uri:https://verifier.example.com/cb')).toEqual({
      scheme: 'redirect_uri',
      originalClientId: 'https://verifier.example.com/cb',
      clientId: 'redirect_uri:https://verifier.example.com/cb',
    })
    expect(parseClientId('decentralized_identifier:did:web:verifier.example.com')).toEqual({
      scheme: 'decentralized_identifier',
      originalClientId: 'did:web:verifier.example.com',
      clientId: 'decentralized_identifier:did:web:verifier.example.com',
    })
  })

  test('rejects bare did: values (OID4VP 1.0 requires decentralized_identifier prefix)', () => {
    expect(parseClientId('did:web:verifier.example.com')).toEqual({
      scheme: 'unknown',
      originalClientId: 'did:web:verifier.example.com',
      clientId: 'did:web:verifier.example.com',
    })
    expect(parseClientId('did:key:zDnaesfzUXzhHkdZvTWTQaZAZTFcXYZnMj5RroE9cSXcBkNb7')).toEqual({
      scheme: 'unknown',
      originalClientId: 'did:key:zDnaesfzUXzhHkdZvTWTQaZAZTFcXYZnMj5RroE9cSXcBkNb7',
      clientId: 'did:key:zDnaesfzUXzhHkdZvTWTQaZAZTFcXYZnMj5RroE9cSXcBkNb7',
    })
  })

  test('matches prefixed did:key client_id without binding response_uri to the DID string', () => {
    expect(
      readResponseUriMatchesClientId(
        'decentralized_identifier:did:key:zDnaesfzUXzhHkdZvTWTQaZAZTFcXYZnMj5RroE9cSXcBkNb7',
        'https://verifier.zenithcomp.co.th:455/openid4vc/verify/session',
      ),
    ).toBe(true)
  })

  test('requires signed request objects for decentralized_identifier', () => {
    expect(clientIdRequiresSignedRequestObject('decentralized_identifier')).toBe(true)
    expect(clientIdRequiresSignedRequestObject('redirect_uri')).toBe(false)
  })

  test('matches redirect_uri client_id to response_uri exactly', () => {
    expect(
      readResponseUriMatchesClientId(
        'redirect_uri:https://verifier.example.com/cb',
        'https://verifier.example.com/cb',
      ),
    ).toBe(true)
    expect(
      readResponseUriMatchesClientId(
        'redirect_uri:https://verifier.example.com/cb',
        'https://verifier.example.com/other',
      ),
    ).toBe(false)
    expect(
      readResponseUriMatchesClientId(
        'redirect_uri:https://verifier.example.com/cb',
        'https://verifier.example.com/other',
        { allowSameOrigin: true },
      ),
    ).toBe(true)
  })

  test('matches decentralized_identifier did:web origins to response_uri origin', () => {
    expect(readDidWebHttpsOrigin('did:web:verifier.example.com')).toBe('https://verifier.example.com')
    expect(
      readResponseUriMatchesClientId(
        'decentralized_identifier:did:web:verifier.example.com',
        'https://verifier.example.com/oid4vp/direct-post',
      ),
    ).toBe(true)
  })
})
