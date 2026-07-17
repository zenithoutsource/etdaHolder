import { fireEvent, render, screen } from '@testing-library/react-native'

import { ThaiIdReceivePanel } from './ThaiIdReceivePanel'

const record = {
  id: 'thai-id-preview',
  type: 'ThaiNationalID',
  rawVc: 'vc',
  issuedAt: '2026-07-17T00:00:00.000Z',
  claims: {
    givenName: 'Somchai',
    familyName: 'Jaidee',
    nationalId: '1-2345-67890-12-3',
    birthDate: '1990-05-15',
    religion: 'Buddhist',
    address: 'Bangkok',
    expiryDate: '2030-11-28',
  },
}

describe('ThaiIdReceivePanel', () => {
  test('renders dynamic claims in the shared card and confirms receipt', () => {
    const onConfirm = jest.fn()

    render(<ThaiIdReceivePanel record={record} onConfirm={onConfirm} />)

    expect(screen.getByTestId('document-card-layout')).toBeTruthy()
    expect(screen.getByTestId('document-card-banner')).toBeTruthy()
    expect(screen.getByTestId('document-card-hero')).toBeTruthy()
    expect(screen.getByTestId('document-card-left-column')).toBeTruthy()
    expect(screen.getByTestId('document-card-divider')).toBeTruthy()
    expect(screen.getByTestId('document-card-right-column')).toBeTruthy()
    expect(screen.getByText('1-2345-67890-12-3')).toBeTruthy()
    expect(screen.getByText('Buddhist')).toBeTruthy()
    expect(screen.getByText('Bangkok')).toBeTruthy()

    fireEvent.press(screen.getByText('ยืนยัน'))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
