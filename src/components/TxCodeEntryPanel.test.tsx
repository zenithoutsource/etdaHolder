import { fireEvent, render, screen } from '@testing-library/react-native'

import { TxCodeEntryPanel } from './TxCodeEntryPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('TxCodeEntryPanel', () => {
  test('tells the holder to enter the code on the verifier screen', () => {
    render(
      <TxCodeEntryPanel
        value=""
        onChange={jest.fn()}
        onContinue={jest.fn()}
        txCode={{ input_mode: 'numeric', length: 6 }}
      />,
    )

    expect(screen.getByTestId('tx-code-entry-panel')).toBeTruthy()
    expect(screen.getByText('รหัสธุรกรรม')).toBeTruthy()
    expect(screen.getByText('กรอกรหัสที่อยู่บนหน้าจอของผู้ตรวจสอบ')).toBeTruthy()
    expect(screen.getByText(/ไม่ใช่รหัส PIN ของ Wallet/)).toBeTruthy()
    expect(screen.getByTestId('tx-code-boxes')).toBeTruthy()
    expect(screen.getByTestId('tx-code-continue')).toBeDisabled()
  })

  test('enables continue after a code is entered', () => {
    const onContinue = jest.fn()
    render(
      <TxCodeEntryPanel
        value="123456"
        onChange={jest.fn()}
        onContinue={onContinue}
        txCode={{ input_mode: 'numeric', length: 6 }}
      />,
    )

    fireEvent.press(screen.getByText('ดำเนินการต่อ'))
    expect(onContinue).toHaveBeenCalledTimes(1)
  })

  test('uses a text field when the code is not a 6-digit numeric box set', () => {
    const onChange = jest.fn()
    render(
      <TxCodeEntryPanel
        value=""
        onChange={onChange}
        onContinue={jest.fn()}
        txCode={{ input_mode: 'text', length: 8 }}
      />,
    )

    expect(screen.getByTestId('tx-code-input')).toBeTruthy()
    expect(screen.queryByTestId('tx-code-boxes')).toBeNull()
    fireEvent.changeText(screen.getByTestId('tx-code-input'), 'AB12CD34')
    expect(onChange).toHaveBeenCalledWith('AB12CD34')
  })
})
