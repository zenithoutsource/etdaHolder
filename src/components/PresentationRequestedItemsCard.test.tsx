import { render, screen } from '@testing-library/react-native'

import { PresentationRequestedItemsCard } from './PresentationRequestedItemsCard'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PresentationRequestedItemsCard', () => {
  test('renders only the user-facing disclosure list', () => {
    render(
      <PresentationRequestedItemsCard
        disclosures={[{ key: 'credential', label: 'Credential', value: 'Academic Transcript' }]}
        onAccept={jest.fn()}
      />,
    )

    expect(screen.getByText('Credential')).toBeTruthy()
    expect(screen.getByText('Academic Transcript')).toBeTruthy()
    expect(screen.queryByText('Verifier Request')).toBeNull()
  })
})
