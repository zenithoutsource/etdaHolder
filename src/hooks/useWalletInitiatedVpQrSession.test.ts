import { act, renderHook } from '@testing-library/react-native'

import { useWalletInitiatedVpQrSession } from './useWalletInitiatedVpQrSession'
import type { BrokerSessionClient } from '../services/vp/brokerSessionClient'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

jest.mock('../services/vp/resolveIssuerPublicJwkFromRawVc', () => ({
  resolveIssuerPublicJwkFromRawVc: jest.fn(),
  formatVpIssuerPublicKeyEnvLine: jest.fn(() => 'VP_ISSUER_PUBLIC_KEY_JWK=...'),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

jest.mock('../services/notifications/expoPushTokenCache', () => ({
  resolveDeviceTokenForBroker: jest.fn(async () => 'ExponentPushToken[test]'),
}))

const credential = {
  id: 'cred-1',
  type: 'ThaiNationalID',
  rawVc: 'issuer.jwt~disclosure~',
  claims: {},
} as unknown as VerifiableCredentialRecord

function createMockBrokerClient(overrides: Partial<BrokerSessionClient> = {}): BrokerSessionClient {
  return {
    createSession: jest.fn(),
    fetchPresentationRequestUri: jest.fn(),
    ...overrides,
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('useWalletInitiatedVpQrSession', () => {
  test('creates a broker session and shows waiting_scan with qr_payload verbatim', async () => {
    const createSession = jest.fn().mockResolvedValue({
      session_id: 'session-1',
      broker_request_endpoint: 'http://broker/session/session-1/request',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      qr_payload: 'http://broker/session/session-1/request',
    })
    const fetchPresentationRequestUri = jest.fn().mockResolvedValue(null)
    const client = createMockBrokerClient({ createSession, fetchPresentationRequestUri })

    const { result } = renderHook(() =>
      useWalletInitiatedVpQrSession({
        credential,
        active: true,
        client,
        walletId: 'wallet-1',
        deviceToken: 'ExponentPushToken[x]',
        platform: 'android',
      }),
    )

    await flush()

    expect(createSession).toHaveBeenCalledWith({
      walletId: 'wallet-1',
      deviceToken: 'ExponentPushToken[x]',
      platform: 'android',
    })
    expect(result.current.phase).toBe('waiting_scan')
    expect(result.current.qrUrl).toBe('http://broker/session/session-1/request')
    expect(result.current.sessionId).toBe('session-1')
    expect(result.current.authorizationRequestUri).toBeNull()
  })

  test('moves to request_ready once the poll returns a deposited request and stops polling', async () => {
    const createSession = jest.fn().mockResolvedValue({
      session_id: 'session-1',
      broker_request_endpoint: 'http://broker/session/session-1/request',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      qr_payload: 'http://broker/session/session-1/request',
    })
    const fetchPresentationRequestUri = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('openid4vp://authorize?request_uri=http://verifier/r/1')
    const client = createMockBrokerClient({ createSession, fetchPresentationRequestUri })

    const { result } = renderHook(() =>
      useWalletInitiatedVpQrSession({
        credential,
        active: true,
        client,
        walletId: 'wallet-1',
        deviceToken: 'token',
        platform: 'android',
      }),
    )

    await flush()
    expect(result.current.phase).toBe('waiting_scan')

    await act(async () => {
      jest.advanceTimersByTime(2_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.phase).toBe('request_ready')
    expect(result.current.authorizationRequestUri).toBe('openid4vp://authorize?request_uri=http://verifier/r/1')

    const callsAtReady = fetchPresentationRequestUri.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(6_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchPresentationRequestUri).toHaveBeenCalledTimes(callsAtReady)
  })

  test('moves to expired once the TTL passes before a request is deposited', async () => {
    const createSession = jest.fn().mockResolvedValue({
      session_id: 'session-1',
      broker_request_endpoint: 'http://broker/session/session-1/request',
      expires_at: new Date(Date.now() + 3_000).toISOString(),
      qr_payload: 'http://broker/session/session-1/request',
    })
    const fetchPresentationRequestUri = jest.fn().mockResolvedValue(null)
    const client = createMockBrokerClient({ createSession, fetchPresentationRequestUri })

    const { result } = renderHook(() =>
      useWalletInitiatedVpQrSession({
        credential,
        active: true,
        client,
        walletId: 'wallet-1',
        deviceToken: 'token',
        platform: 'android',
      }),
    )

    await flush()

    await act(async () => {
      jest.advanceTimersByTime(4_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.phase).toBe('expired')
    expect(result.current.qrUrl).toBeNull()
  })

  test('sets phase to error when broker session creation fails', async () => {
    const createSession = jest.fn().mockRejectedValue(new Error('BrokerSessionCreateFailed:500'))
    const client = createMockBrokerClient({ createSession })

    const { result } = renderHook(() =>
      useWalletInitiatedVpQrSession({
        credential,
        active: true,
        client,
        walletId: 'wallet-1',
        deviceToken: 'token',
        platform: 'android',
      }),
    )

    await flush()

    expect(result.current.phase).toBe('error')
  })

  test('stops polling once the session becomes inactive', async () => {
    const createSession = jest.fn().mockResolvedValue({
      session_id: 'session-1',
      broker_request_endpoint: 'http://broker/session/session-1/request',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      qr_payload: 'http://broker/session/session-1/request',
    })
    const fetchPresentationRequestUri = jest.fn().mockResolvedValue(null)
    const client = createMockBrokerClient({ createSession, fetchPresentationRequestUri })

    const { result, rerender } = renderHook(
      (props: { active: boolean }) =>
        useWalletInitiatedVpQrSession({
          credential,
          active: props.active,
          client,
          walletId: 'wallet-1',
          deviceToken: 'token',
          platform: 'android',
        }),
      { initialProps: { active: true } },
    )

    await flush()
    expect(result.current.phase).toBe('waiting_scan')

    rerender({ active: false })
    await flush()

    expect(result.current.phase).toBe('idle')
    expect(result.current.qrUrl).toBeNull()

    const callsAtInactive = fetchPresentationRequestUri.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(10_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(fetchPresentationRequestUri).toHaveBeenCalledTimes(callsAtInactive)
  })
})
