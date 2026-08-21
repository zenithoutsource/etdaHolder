import { readTrustAnyOid4vcPeerEnabled } from './oid4vcPeerTrustPolicy'

describe('oid4vcPeerTrustPolicy', () => {
  const original = process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
    } else {
      process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = original
    }
  })

  test('defaults off', () => {
    delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
    expect(readTrustAnyOid4vcPeerEnabled()).toBe(false)
  })

  test('enables only for the string true', () => {
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'true'
    expect(readTrustAnyOid4vcPeerEnabled()).toBe(true)
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = '1'
    expect(readTrustAnyOid4vcPeerEnabled()).toBe(false)
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'false'
    expect(readTrustAnyOid4vcPeerEnabled()).toBe(false)
  })
})
