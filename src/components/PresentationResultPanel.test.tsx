import { render, screen } from '@testing-library/react-native'

import { PresentationResultPanel } from './PresentationResultPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PresentationResultPanel', () => {
  test('renders success confirmation without a shared-field list', () => {
    render(<PresentationResultPanel verifierName="Verifier" onDone={jest.fn()} />)

    expect(screen.getByText('ตรวจสอบสำเร็จ')).toBeTruthy()
    expect(screen.queryByText('Date of Birth')).toBeNull()
  })
})
