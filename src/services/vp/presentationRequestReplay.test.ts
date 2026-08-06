import {
  configurePresentationReplayStorage,
  isPresentationNonceConsumed,
  isPresentationRequestConsumed,
  markPresentationRequestConsumed,
  PRESENTATION_REPLAY_STORAGE_KEY,
} from './presentationRequestReplay'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getString: (key: string) => values.get(key),
    set: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

describe('presentationRequestReplay', () => {
  test('persists request and nonce fingerprints across ledger reconfiguration', () => {
    const storage = createStorage()
    const requestUri = 'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Fr%2F1'
    const nonce = 'nonce-123'

    configurePresentationReplayStorage(storage)
    markPresentationRequestConsumed({ requestUri, nonce })

    expect(isPresentationRequestConsumed(requestUri)).toBe(true)
    expect(isPresentationNonceConsumed(nonce)).toBe(true)

    configurePresentationReplayStorage(storage)

    expect(isPresentationRequestConsumed(requestUri)).toBe(true)
    expect(isPresentationNonceConsumed(nonce)).toBe(true)
    expect(storage.getString(PRESENTATION_REPLAY_STORAGE_KEY)).not.toContain(requestUri)
    expect(storage.getString(PRESENTATION_REPLAY_STORAGE_KEY)).not.toContain(nonce)
  })

  test('does not treat a different request or nonce as consumed', () => {
    const storage = createStorage()
    configurePresentationReplayStorage(storage)
    markPresentationRequestConsumed({
      requestUri: 'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Fr%2F1',
      nonce: 'nonce-123',
    })

    expect(isPresentationRequestConsumed('openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Fr%2F2')).toBe(false)
    expect(isPresentationNonceConsumed('nonce-456')).toBe(false)
  })

  test('rejects a second reservation for an already consumed request or nonce', () => {
    const storage = createStorage()
    configurePresentationReplayStorage(storage)
    markPresentationRequestConsumed({
      requestUri: 'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Fr%2F1',
      nonce: 'nonce-123',
    })

    expect(() => markPresentationRequestConsumed({
      requestUri: 'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Fr%2F2',
      nonce: 'nonce-123',
    })).toThrow('PresentationRequestReplay')
  })

  test('fails closed and rolls back the in-memory record when persistence fails', () => {
    configurePresentationReplayStorage({
      getString: () => undefined,
      set: () => {
        throw new Error('storage unavailable')
      },
    })

    expect(() => markPresentationRequestConsumed({
      requestUri: 'openid4vp://authorize?request_uri=https%3A%2F%2Fverifier.example%2Fr%2F3',
      nonce: 'nonce-789',
    })).toThrow('PresentationReplayLedgerWriteFailed')
    expect(isPresentationNonceConsumed('nonce-789')).toBe(false)
  })

  test('rejects a corrupt persisted ledger instead of treating it as empty', () => {
    expect(() => configurePresentationReplayStorage({
      getString: () => JSON.stringify({ version: 99, fingerprints: [] }),
      set: () => undefined,
    })).toThrow('PresentationReplayLedgerCorrupt')
  })
})
