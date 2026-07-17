import { fireEvent, render, screen } from '@testing-library/react-native'

import { ThaiIdSuccessConfirmationPanel } from './ThaiIdSuccessConfirmationPanel'

const record = {
  id: 'id-card-1',
  type: 'ThaiNationalID',
  issuedAt: '2026-06-09T00:00:00.000Z',
  rawVc: 'vc',
  claims: {},
}

describe('ThaiIdSuccessConfirmationPanel', () => {
  test('renders the shared Thai ID receive confirmation and confirms save', () => {
    const onConfirm = jest.fn()

    render(<ThaiIdSuccessConfirmationPanel record={record} onConfirm={onConfirm} />)

    expect(screen.getByTestId('document-card-layout')).toBeTruthy()
    expect(screen.getByTestId('document-card-banner')).toBeTruthy()
    fireEvent.press(screen.getByText('ยืนยัน'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
