import { shouldResetCredentialDetailSession } from './credentialDetailSession'

describe('credentialDetailSession', () => {
  test('resets local approval state when the credential route id changes', () => {
    expect(shouldResetCredentialDetailSession('old-transcript', 'new-transcript')).toBe(true)
  })

  test('keeps local state for the same credential route id', () => {
    expect(shouldResetCredentialDetailSession('transcript-1', 'transcript-1')).toBe(false)
    expect(shouldResetCredentialDetailSession(undefined, 'transcript-1')).toBe(false)
  })
})
