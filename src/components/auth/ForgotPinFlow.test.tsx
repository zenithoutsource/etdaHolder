import { fireEvent, render, screen } from '@testing-library/react-native'

import { ForgotPinFlow } from './ForgotPinFlow'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

jest.mock('@/src/store/authStore', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      requestPinReset: jest.fn(),
      verifyPinResetOtp: jest.fn(),
      confirmPinReset: jest.fn(),
      isLoading: false,
    }),
}))

describe('ForgotPinFlow', () => {
  test('calls onBack when the header Back control is pressed', () => {
    const onBack = jest.fn()

    render(<ForgotPinFlow onBack={onBack} onComplete={jest.fn()} />)

    fireEvent.press(screen.getByLabelText('Back'))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  test('shows the email card and Send Code action', () => {
    render(<ForgotPinFlow onBack={jest.fn()} onComplete={jest.fn()} />)

    expect(screen.getByText('Reset PIN')).toBeTruthy()
    expect(screen.getByPlaceholderText('Email')).toBeTruthy()
    expect(screen.getByText('Send Code')).toBeTruthy()
    expect(screen.queryByTestId('pin-entry-code-boxes')).toBeNull()
  })

  test('shows startup reset notice when requested', () => {
    render(<ForgotPinFlow onBack={jest.fn()} onComplete={jest.fn()} showResetNotice />)

    expect(
      screen.getByText(/เข้าสู่ระบบอีกครั้งด้วย PIN ใหม่ เอกสารบนเครื่องนี้จะยังอยู่/),
    ).toBeTruthy()
    expect(screen.queryByText(/ซิงค์จากเซิร์ฟเวอร์/)).toBeNull()
    expect(screen.queryByText(/ข้อมูลในเครื่องจะถูกล้าง/)).toBeNull()
  })
})
