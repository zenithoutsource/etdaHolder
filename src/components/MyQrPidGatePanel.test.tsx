import { fireEvent, render, screen } from '@testing-library/react-native'

import { MyQrPidGatePanel } from './MyQrPidGatePanel'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('MyQrPidGatePanel', () => {
  test('shows present-purpose missing copy and requests PID', () => {
    const onRequestPid = jest.fn()
    render(<MyQrPidGatePanel gateStatus="missing" onRequestPid={onRequestPid} />)

    expect(screen.getByTestId('my-qr-pid-gate-panel')).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.pidRequiredTitle)).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.pidRequiredToPresentMessage)).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.myQrPidGateReason)).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.myQrPidGateNote)).toBeTruthy()
    expect(screen.queryByText(WALLET_HOME_COPY.pidRequiredMessage)).toBeNull()

    fireEvent.press(screen.getByTestId('my-qr-pid-gate-request'))
    expect(onRequestPid).toHaveBeenCalledTimes(1)
  })

  test('shows suspended present copy and still offers request PID', () => {
    const onRequestPid = jest.fn()
    render(<MyQrPidGatePanel gateStatus="suspended" onRequestPid={onRequestPid} />)

    expect(screen.getByText(WALLET_HOME_COPY.pidSuspendedTitle)).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.pidSuspendedToPresentMessage)).toBeTruthy()
    fireEvent.press(screen.getByText(WALLET_HOME_COPY.requestThaId))
    expect(onRequestPid).toHaveBeenCalledTimes(1)
  })

  test('shows present-purpose expired copy and requests PID', () => {
    const onRequestPid = jest.fn()
    render(<MyQrPidGatePanel gateStatus="document-expired" onRequestPid={onRequestPid} />)

    expect(screen.getByText(WALLET_HOME_COPY.pidExpiredTitle)).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.pidExpiredToPresentMessage)).toBeTruthy()
    expect(screen.queryByText(WALLET_HOME_COPY.pidExpiredMessage)).toBeNull()
    expect(screen.queryByText(WALLET_HOME_COPY.renewThaIdRequiredTitle)).toBeNull()

    fireEvent.press(screen.getByTestId('my-qr-pid-gate-request'))
    expect(onRequestPid).toHaveBeenCalledTimes(1)
  })

  test('hides the request CTA when PID renewal is required', () => {
    render(<MyQrPidGatePanel gateStatus="renewal-required" onRequestPid={jest.fn()} />)

    expect(screen.getByText(WALLET_HOME_COPY.renewThaIdRequiredTitle)).toBeTruthy()
    expect(screen.getByText(WALLET_HOME_COPY.renewThaIdRequiredMessage)).toBeTruthy()
    expect(screen.queryByTestId('my-qr-pid-gate-request')).toBeNull()
    expect(screen.queryByText(WALLET_HOME_COPY.requestThaId)).toBeNull()
  })
})
