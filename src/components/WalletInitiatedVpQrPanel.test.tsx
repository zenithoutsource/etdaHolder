import { fireEvent, render, screen } from '@testing-library/react-native'

import { WalletInitiatedVpQrPanel } from './WalletInitiatedVpQrPanel'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => () => null)

jest.mock('react-native-qrcode-svg', () => {
  return function MockQRCode() {
    return null
  }
})

describe('WalletInitiatedVpQrPanel expired state', () => {
  test('shows Thai expired copy and regenerates on retry', () => {
    const onRetry = jest.fn()

    render(
      <WalletInitiatedVpQrPanel
        phase="expired"
        qrUrl={null}
        minutes="0"
        seconds="00"
        onRetry={onRetry}
      />,
    )

    expect(screen.getByTestId('wallet-initiated-vp-qr-expired')).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.myQrExpiredTitle)).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.myQrExpiredMessage)).toBeTruthy()
    expect(screen.queryByText(/หมดอายุใน/)).toBeNull()

    fireEvent.press(screen.getByTestId('wallet-initiated-vp-qr-expired-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  test('shows Thai create-error copy and retries', () => {
    const onRetry = jest.fn()

    render(
      <WalletInitiatedVpQrPanel
        phase="error"
        qrUrl={null}
        minutes="0"
        seconds="00"
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText(WALLET_HOME_COPY.myQrCreateErrorTitle)).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.myQrCreateErrorMessage)).toBeTruthy()

    fireEvent.press(screen.getByTestId('wallet-initiated-vp-qr-error-retry'))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
