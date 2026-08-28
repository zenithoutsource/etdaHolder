import { useDcApiPresentationStore } from './dcApiPresentationStore'

describe('dcApiPresentationStore', () => {
  beforeEach(() => {
    useDcApiPresentationStore.setState({
      phase: { tag: 'idle' },
      routeGeneration: 0,
      consentAcceptedSessionId: null,
      selectedClaimKeys: [],
    })
  })

  test('queueIncomingRequest replaces a stale pending session with a new session id', () => {
    useDcApiPresentationStore.getState().queueIncomingRequest({
      sessionId: 'session-a',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      request: { nonce: 'nonce-a' },
      transport: 'same_device',
    })

    useDcApiPresentationStore.getState().queueIncomingRequest({
      sessionId: 'session-b',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      request: { nonce: 'nonce-b' },
      transport: 'cross_device',
      selectedCredentialId: 'mdl-1',
    })

    expect(useDcApiPresentationStore.getState().phase).toEqual({
      tag: 'pending',
      sessionId: 'session-b',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      request: { nonce: 'nonce-b' },
      transport: 'cross_device',
      selectedCredentialId: 'mdl-1',
    })
  })

  test('queueIncomingRequest supersedes an in-flight completing session', () => {
    useDcApiPresentationStore.setState({
      phase: { tag: 'completing', sessionId: 'session-a' },
    })

    useDcApiPresentationStore.getState().queueIncomingRequest({
      sessionId: 'session-b',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      request: { nonce: 'nonce-b' },
      transport: 'same_device',
    })

    expect(useDcApiPresentationStore.getState().phase).toEqual({
      tag: 'pending',
      sessionId: 'session-b',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      request: { nonce: 'nonce-b' },
      transport: 'same_device',
    })
  })

  test('setResolvedPresentation ignores stale sessions', () => {
    useDcApiPresentationStore.setState({
      phase: {
        tag: 'pending',
        sessionId: 'session-b',
        protocol: 'openid4vp-v1-unsigned',
        origin: 'https://digital-credentials.dev',
        request: { nonce: 'nonce-b' },
        transport: 'same_device',
      },
    })

    useDcApiPresentationStore.getState().setResolvedPresentation({
      sessionId: 'session-a',
      protocol: 'openid4vp-v1-unsigned',
      origin: 'https://digital-credentials.dev',
      responseMode: 'dc_api',
      authorizationRequest: { nonce: 'nonce-a' },
      dcqlQuery: { credentials: [] },
      selectedDcqlQueryId: 'mdl',
      matchedCredential: {
        id: 'mdl-1',
        type: 'DLTDrivingLicence',
        rawVc: 'mdoc:abc',
        claims: {},
        issuedAt: '2026-08-26T00:00:00.000Z',
      },
      nonce: 'nonce-a',
      requestedNamespaceKeys: [],
    })

    expect(useDcApiPresentationStore.getState().phase.tag).toBe('pending')
  })
})
