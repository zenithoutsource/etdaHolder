import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'

import PinLockScreen from '../../app/pin-lock'

const mockReact = React
const mockRouterPush = jest.fn()
const mockConfirmWalletUnlockBiometric = jest.fn()
const mockIsWalletUnlockBiometricCancellation = jest.fn()
const mockLogWalletError = jest.fn()
const mockLogWalletStep = jest.fn()
const mockSetPinVerified = jest.fn()
const mockVerifyWalletPin = jest.fn()
const mockProvisionStoragePinFallback = jest.fn()

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockReact.useEffect(() => effect(), [effect])
  },
}))

jest.mock('../config/runtimeFlags', () => ({
  isBiometricDisabledForTesting: jest.fn(() => false),
}))

jest.mock('../services/auth/walletPin', () => ({
  verifyWalletPin: (pin: string) => mockVerifyWalletPin(pin),
}))

jest.mock('../services/auth/walletUnlockBiometric', () => ({
  confirmWalletUnlockBiometric: () => mockConfirmWalletUnlockBiometric(),
  isWalletUnlockBiometricCancellation: (error: unknown) => mockIsWalletUnlockBiometricCancellation(error),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: (...args: unknown[]) => mockLogWalletError(...args),
  logWalletStep: (...args: unknown[]) => mockLogWalletStep(...args),
}))

jest.mock('../services/storage/storage', () => ({
  provisionStoragePinFallback: (pin: string) => mockProvisionStoragePinFallback(pin),
}))

jest.mock('../store/authStore', () => ({
  useAuthStore: (selector: (state: { setPinVerified: typeof mockSetPinVerified }) => unknown) =>
    selector({ setPinVerified: mockSetPinVerified }),
}))

describe('PinLockScreen biometric unlock', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockRouterPush.mockReset()
    mockConfirmWalletUnlockBiometric.mockReset()
    mockIsWalletUnlockBiometricCancellation.mockReset()
    mockLogWalletError.mockReset()
    mockLogWalletStep.mockReset()
    mockSetPinVerified.mockReset()
    mockVerifyWalletPin.mockReset()
    mockProvisionStoragePinFallback.mockReset()
    mockVerifyWalletPin.mockReturnValue(false)
    mockIsWalletUnlockBiometricCancellation.mockImplementation(
      (error: unknown) => error instanceof Error && error.message === 'WalletUnlockBiometricCancelled',
    )
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  test('does not auto-prompt biometric on mount so PIN entry is immediately available', async () => {
    render(<PinLockScreen />)

    act(() => {
      jest.advanceTimersByTime(500)
    })

    await waitFor(() => {
      expect(mockConfirmWalletUnlockBiometric).not.toHaveBeenCalled()
    })
  })

  test('unlocks via biometric only when the fingerprint control is pressed', async () => {
    mockConfirmWalletUnlockBiometric.mockResolvedValueOnce(undefined)

    render(<PinLockScreen />)

    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

    await waitFor(() => {
      expect(mockConfirmWalletUnlockBiometric).toHaveBeenCalledTimes(1)
      expect(mockSetPinVerified).toHaveBeenCalledWith(true)
    })
  })

  test('provisions storage PIN fallback after successful PIN unlock', () => {
    mockVerifyWalletPin.mockReturnValueOnce(true)

    render(<PinLockScreen />)

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }

    expect(mockVerifyWalletPin).toHaveBeenCalledWith('123456')
    expect(mockProvisionStoragePinFallback).toHaveBeenCalledWith('123456')
    expect(mockSetPinVerified).toHaveBeenCalledWith(true)
  })
})
