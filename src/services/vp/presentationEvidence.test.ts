import { readCompactTokenSignature } from './presentationEvidence'

describe('presentationEvidence', () => {
  test('extracts the signature from a compact JWT', () => {
    expect(readCompactTokenSignature('header.payload.real-signature')).toBe('real-signature')
  })

  test('extracts the issuer JWT signature from a compact SD-JWT', () => {
    expect(readCompactTokenSignature('header.payload.sd-jwt-signature~disclosure~')).toBe('sd-jwt-signature')
  })

  test('returns undefined when no compact signature is available', () => {
    expect(readCompactTokenSignature('nonce-123')).toBeUndefined()
  })
})
