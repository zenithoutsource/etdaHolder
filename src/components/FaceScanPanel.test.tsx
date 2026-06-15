import { render, screen } from '@testing-library/react-native'

import { FaceScanPanel } from './FaceScanPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('FaceScanPanel', () => {
  test('renders simulated face scan using native views only', () => {
    render(<FaceScanPanel onComplete={jest.fn()} />)

    expect(screen.getByTestId('face-scan-ring-outer')).toBeTruthy()
    expect(screen.getByTestId('face-scan-ring-inner')).toBeTruthy()
  })
})
