import { render, screen } from '@testing-library/react-native'

import { PresentationDisclosureList } from './PresentationDisclosureList'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PresentationDisclosureList', () => {
  test('renders disclosure labels and values', () => {
    render(
      <PresentationDisclosureList
        variant="review"
        items={[{ key: 'age', label: 'Age over 20', value: 'Verified' }]}
      />,
    )

    expect(screen.getByText('Age over 20')).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
  })
})
