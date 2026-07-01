import { resolveRenewalReadyReplacementRoute } from './notificationRenewalRoute'

describe('resolveRenewalReadyReplacementRoute', () => {
  test('returns replacement credential route for renewal-ready notification after claim completes', () => {
    expect(resolveRenewalReadyReplacementRoute({
      credentialId: 'old-cred',
      notificationEvent: 'renewal-ready',
      replacementCredentialId: 'new-cred',
    })).toEqual({
      pathname: '/(tabs)/credential/[id]',
      params: { id: 'new-cred' },
    })
  })

  test('does not redirect normal detail visits to old renewal credential', () => {
    expect(resolveRenewalReadyReplacementRoute({
      credentialId: 'old-cred',
      replacementCredentialId: 'new-cred',
    })).toBeUndefined()
  })
})
