import {
  readTrustAnyOid4vcIssuerEnabled,
  readTrustAnyOid4vcPeerEnabled,
  readTrustAnyOid4vcPeerForClientId,
  readTrustAnyOid4vcVerifierEnabled,
} from './oid4vcPeerTrustPolicy'
import * as trustedVerifiers from './trustedVerifiers'

describe('oid4vcPeerTrustPolicy', () => {
  const originalPeer = process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
  const originalIssuer = process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER
  const originalVerifier = process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER
  const originalDemo = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

  afterEach(() => {
    restoreEnv('EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER', originalPeer)
    restoreEnv('EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER', originalIssuer)
    restoreEnv('EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER', originalVerifier)
    restoreEnv('EXPO_PUBLIC_WALLET_DEMO_INTEROP', originalDemo)
  })

  test('defaults off', () => {
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER
    expect(readTrustAnyOid4vcIssuerEnabled()).toBe(false)
    expect(readTrustAnyOid4vcVerifierEnabled()).toBe(false)
    expect(readTrustAnyOid4vcPeerEnabled()).toBe(false)
  })

  test('master peer flag enables issuer and verifier paths', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(readTrustAnyOid4vcIssuerEnabled()).toBe(true)
    expect(readTrustAnyOid4vcVerifierEnabled()).toBe(true)
    expect(readTrustAnyOid4vcPeerEnabled()).toBe(true)
  })

  test('issuer and verifier flags toggle independently', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER = 'true'
    expect(readTrustAnyOid4vcIssuerEnabled()).toBe(true)
    expect(readTrustAnyOid4vcVerifierEnabled()).toBe(false)
    expect(readTrustAnyOid4vcPeerEnabled()).toBe(false)

    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER = 'true'
    expect(readTrustAnyOid4vcIssuerEnabled()).toBe(false)
    expect(readTrustAnyOid4vcVerifierEnabled()).toBe(true)
  })

  test('does not enable the legacy peer reader when only both granular flags are on', () => {
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
    delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER = 'true'
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER = 'true'

    expect(readTrustAnyOid4vcPeerEnabled()).toBe(false)
  })

  test('enables only for the string true', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = '1'
    expect(readTrustAnyOid4vcIssuerEnabled()).toBe(false)
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'false'
    expect(readTrustAnyOid4vcVerifierEnabled()).toBe(false)
  })

  test('demo interop profile enables verifier and issuer trust without peer flags', () => {
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

    expect(readTrustAnyOid4vcVerifierEnabled()).toBe(true)
    expect(readTrustAnyOid4vcIssuerEnabled()).toBe(true)
  })

  test('routes presentation trust by issuer vs verifier client_id', () => {
    const issuerSpy = jest.spyOn(trustedVerifiers, 'isIssuerOid4VpClientId')
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER = 'true'

    issuerSpy.mockReturnValueOnce(true)
    expect(readTrustAnyOid4vcPeerForClientId('decentralized_identifier:did:web:issuer.example.com')).toBe(true)

    issuerSpy.mockReturnValueOnce(false)
    expect(readTrustAnyOid4vcPeerForClientId('decentralized_identifier:did:web:verifier.example.com')).toBe(false)

    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER = 'true'
    issuerSpy.mockReturnValueOnce(false)
    expect(readTrustAnyOid4vcPeerForClientId('decentralized_identifier:did:web:verifier.example.com')).toBe(true)

    issuerSpy.mockRestore()
  })
})

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
}
