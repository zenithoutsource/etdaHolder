import '@testing-library/jest-native/extend-expect'

beforeEach(() => {
  process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'false'
  process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER = 'false'
  delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER
  delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER
})
