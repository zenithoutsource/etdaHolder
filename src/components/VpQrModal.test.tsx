import { act, render, screen } from '@testing-library/react-native'

import { VpQrModal } from './VpQrModal'

jest.mock('react-native-qrcode-svg', () => {
  return function MockQRCode() {
    return null
  }
})

jest.mock('../services/vp/resolveIssuerPublicJwkFromRawVc', () => ({
  resolveIssuerPublicJwkFromRawVc: jest.fn(),
  formatVpIssuerPublicKeyEnvLine: jest.fn(() => 'VP_ISSUER_PUBLIC_KEY_JWK=...'),
}))

const mockCreateVpSession = jest.fn()
const mockBuildWalletInitiatedVpToken = jest.fn()
const mockSubmitVpToSession = jest.fn()
const mockBuildQrUrl = jest.fn()
const mockFetchVpSessionStatus = jest.fn()
const mockRecordWalletInitiatedPresentationHistory = jest.fn()
const mockRecordWalletInitiatedPresentationFailure = jest.fn()

jest.mock('../services/history/walletHistoryRecording', () => ({
  recordWalletInitiatedPresentationFailure: (...args: unknown[]) =>
    mockRecordWalletInitiatedPresentationFailure(...args),
}))

jest.mock('../services/vp/walletInitiatedPresentation', () => ({
  buildQrUrl: (...args: unknown[]) => mockBuildQrUrl(...args),
  createVpSession: (...args: unknown[]) => mockCreateVpSession(...args),
  buildWalletInitiatedVpToken: (...args: unknown[]) => mockBuildWalletInitiatedVpToken(...args),
  submitVpToSession: (...args: unknown[]) => mockSubmitVpToSession(...args),
  fetchVpSessionStatus: (...args: unknown[]) => mockFetchVpSessionStatus(...args),
  readWalletInitiatedClaimLabels: () => ['ชื่อ'],
  recordWalletInitiatedPresentationHistory: (...args: unknown[]) =>
    mockRecordWalletInitiatedPresentationHistory(...args),
}))

const credential = {
  id: 'cred-1',
  type: 'ThaiNationalID',
  rawVc: 'issuer.jwt~disclosure~',
  claims: {},
} as never

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  mockCreateVpSession.mockResolvedValue({
    sessionId: 'session-1',
    nonce: 'n'.repeat(64),
    expiresAt: new Date(Date.now() + 5_000).toISOString(),
  })
  mockBuildWalletInitiatedVpToken.mockResolvedValue('vp~kb')
  mockSubmitVpToSession.mockResolvedValue(undefined)
  mockBuildQrUrl.mockReturnValue('http://localhost:4000/dev/vp-verify?s=session-1')
  mockFetchVpSessionStatus.mockResolvedValue({ status: 'ready' })
})

afterEach(() => {
  jest.useRealTimers()
})

describe('VpQrModal', () => {
  test('shows QR expired copy after countdown reaches zero', async () => {
    mockCreateVpSession.mockResolvedValue({
      sessionId: 'session-1',
      nonce: 'n'.repeat(64),
      expiresAt: new Date(Date.now() + 2_000).toISOString(),
    })

    render(<VpQrModal visible credential={credential} onClose={jest.fn()} />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText(/หมดอายุใน/)).toBeTruthy()

    await act(async () => {
      jest.advanceTimersByTime(2_500)
    })

    expect(screen.getByText('QR หมดอายุ')).toBeTruthy()
    expect(screen.queryByText(/หมดอายุใน/)).toBeNull()
    expect(mockRecordWalletInitiatedPresentationHistory).not.toHaveBeenCalled()
  })

  test('records presentation history only after verifier verifies session', async () => {
    mockFetchVpSessionStatus
      .mockResolvedValueOnce({ status: 'ready' })
      .mockResolvedValueOnce({ status: 'verified' })

    render(<VpQrModal visible credential={credential} onClose={jest.fn()} />)

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      jest.advanceTimersByTime(2_500)
    })

    expect(mockRecordWalletInitiatedPresentationHistory).toHaveBeenCalledTimes(1)
    expect(mockRecordWalletInitiatedPresentationFailure).not.toHaveBeenCalled()
    expect(screen.queryByText('QR หมดอายุ')).toBeNull()
  })

  test('shows verify failed and records presentation-failed history', async () => {
    mockFetchVpSessionStatus
      .mockResolvedValueOnce({ status: 'ready' })
      .mockResolvedValueOnce({ status: 'verify_failed', reason: 'issuer-signature-invalid' })

    render(<VpQrModal visible credential={credential} onClose={jest.fn()} />)

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      jest.advanceTimersByTime(2_500)
    })

    expect(screen.getByText('ไม่ผ่านการตรวจสอบ')).toBeTruthy()
    expect(mockRecordWalletInitiatedPresentationFailure).toHaveBeenCalledTimes(1)
    expect(mockRecordWalletInitiatedPresentationHistory).not.toHaveBeenCalled()
  })

  test('shows QR expired when relay status reports expired', async () => {
    mockFetchVpSessionStatus.mockResolvedValue({ status: 'expired' })

    render(<VpQrModal visible credential={credential} onClose={jest.fn()} />)

    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      jest.advanceTimersByTime(2_500)
    })

    expect(screen.getByText('QR หมดอายุ')).toBeTruthy()
    expect(mockRecordWalletInitiatedPresentationHistory).not.toHaveBeenCalled()
  })
})
