import { render, screen } from '@testing-library/react-native'

import { PresentationResultPanel } from './PresentationResultPanel'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PresentationResultPanel', () => {
  test('renders result items passed by the scan flow', () => {
    render(
      <PresentationResultPanel
        verifierName="Verifier"
        items={[{ key: 'birthDate', label: 'Date of Birth', status: 'verified' }]}
        onDone={jest.fn()}
      />,
    )

    expect(screen.getByText('Date of Birth')).toBeTruthy()
  })
})
