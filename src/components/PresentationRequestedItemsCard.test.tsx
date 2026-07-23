import { render, screen } from '@testing-library/react-native'

import { PresentationRequestedItemsCard } from './PresentationRequestedItemsCard'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

describe('PresentationRequestedItemsCard', () => {
  test('renders schema presentation labels for requested disclosures', () => {
    render(
      <PresentationRequestedItemsCard
        documentType="ChulalongkornUniversityTranscript"
        disclosures={[{ key: 'gpa', label: 'GPA', value: '3.75' }]}
        onAccept={jest.fn()}
      />,
    )

    expect(screen.getByText('เกรดเฉลี่ย')).toBeTruthy()
    expect(screen.getByText('3.75')).toBeTruthy()
    expect(screen.queryByText('Verifier Request')).toBeNull()
  })
})
