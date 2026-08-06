import { fireEvent, render, screen } from '@testing-library/react-native'

import { ForgotPinFlow } from './ForgotPinFlow'

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
  test('calls onBack when Back is pressed', () => {
    const onBack = jest.fn()

    render(<ForgotPinFlow onBack={onBack} onComplete={jest.fn()} />)

    fireEvent.press(screen.getByText('Back'))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  test('shows startup reset notice when requested', () => {
    render(<ForgotPinFlow onBack={jest.fn()} onComplete={jest.fn()} showResetNotice />)

    expect(
      screen.getByText(/หลังรีเซ็ต PIN คุณต้องเข้าสู่ระบบใหม่/),
    ).toBeTruthy()
  })
})
