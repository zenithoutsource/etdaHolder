import { render, screen } from '@testing-library/react-native'

import { VpQrModal } from './VpQrModal'

jest.mock('react-native-qrcode-svg', () => {
  return function MockQRCode() {
    return null
  }
})

const mockUseSession = jest.fn()

jest.mock('../hooks/useWalletInitiatedVpQrSession', () => ({
  useWalletInitiatedVpQrSession: (...args: unknown[]) => mockUseSession(...args),
}))

const credential = {
  id: 'cred-1',
  type: 'ThaiNationalID',
  rawVc: 'issuer.jwt~disclosure~',
  claims: {},
} as never

function sessionState(overrides: Record<string, unknown> = {}) {
  return {
    phase: 'waiting_scan',
    qrUrl: 'http://broker/session/s1/request',
    devEnvLine: null,
    minutes: '0',
    seconds: '59',
    sessionId: 's1',
    authorizationRequestUri: null,
    startSession: jest.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('VpQrModal', () => {
  test('renders the broker QR countdown while waiting for the verifier to scan', () => {
    mockUseSession.mockReturnValue(sessionState())

    render(<VpQrModal visible credential={credential} onClose={jest.fn()} />)

    expect(screen.getByText(/หมดอายุใน/)).toBeTruthy()
  })

  test('shows QR expired copy when the broker session expires', () => {
    mockUseSession.mockReturnValue(sessionState({ phase: 'expired', qrUrl: null }))

    render(<VpQrModal visible credential={credential} onClose={jest.fn()} />)

    expect(screen.getByText('QR หมดอายุ')).toBeTruthy()
    expect(screen.queryByText(/หมดอายุใน/)).toBeNull()
  })

  test('shows error copy when the broker session fails to start', () => {
    mockUseSession.mockReturnValue(sessionState({ phase: 'error', qrUrl: null }))

    render(<VpQrModal visible credential={credential} onClose={jest.fn()} />)

    expect(screen.getByText('ไม่สามารถสร้าง QR ได้')).toBeTruthy()
  })

  test('activates the session only while the modal is visible', () => {
    mockUseSession.mockReturnValue(sessionState())

    render(<VpQrModal visible credential={credential} onClose={jest.fn()} />)

    expect(mockUseSession).toHaveBeenCalledWith(expect.objectContaining({ active: true }))
  })
})
