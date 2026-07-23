import { fireEvent, render, screen } from '@testing-library/react-native'

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
        disclosures={[{ key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true }]}
        selectedClaimKeys={new Set(['gpa'])}
        onToggleClaim={jest.fn()}
        onAccept={jest.fn()}
      />,
    )

    expect(screen.getByText('เกรดเฉลี่ย')).toBeTruthy()
    expect(screen.getByText('3.75')).toBeTruthy()
    expect(screen.queryByText('Verifier Request')).toBeNull()
  })

  test('disables accept when no selective claims remain selected', () => {
    render(
      <PresentationRequestedItemsCard
        documentType="ChulalongkornUniversityTranscript"
        disclosures={[{ key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true }]}
        selectedClaimKeys={new Set()}
        onToggleClaim={jest.fn()}
        onAccept={jest.fn()}
      />,
    )

    expect(screen.getByText('ยอมรับ')).toBeDisabled()
  })

  test('shows helper text for selectable items', () => {
    render(
      <PresentationRequestedItemsCard
        documentType="ChulalongkornUniversityTranscript"
        disclosures={[{ key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true }]}
        selectedClaimKeys={new Set(['gpa'])}
        onToggleClaim={jest.fn()}
        onAccept={jest.fn()}
      />,
    )

    expect(screen.getByText('แตะรายการที่เลือกได้เพื่อส่งหรือไม่ส่ง')).toBeTruthy()
  })

  test('calls onToggleClaim for selectable review rows', () => {
    const onToggleClaim = jest.fn()
    render(
      <PresentationRequestedItemsCard
        documentType="ChulalongkornUniversityTranscript"
        disclosures={[{ key: 'gpa', label: 'GPA', value: '3.75', mandatory: false, selective: true }]}
        selectedClaimKeys={new Set(['gpa'])}
        onToggleClaim={onToggleClaim}
        onAccept={jest.fn()}
      />,
    )

    fireEvent.press(screen.getByLabelText('เกรดเฉลี่ย'))
    expect(onToggleClaim).toHaveBeenCalledWith('gpa')
  })

  test('renders mandatory disclosures with required badge and keeps accept enabled', () => {
    render(
      <PresentationRequestedItemsCard
        documentType="ThaID"
        disclosures={[{ key: 'national_id', label: 'National ID', value: '1234567890123', mandatory: true, selective: false }]}
        selectedClaimKeys={new Set(['national_id'])}
        onToggleClaim={jest.fn()}
        onAccept={jest.fn()}
      />,
    )

    expect(screen.getByText('จำเป็น')).toBeTruthy()
    expect(screen.getByTestId('mandatory-badge-national_id')).toBeTruthy()
    expect(screen.getByText('ยอมรับ')).not.toBeDisabled()
    expect(screen.queryByText('แตะรายการที่เลือกได้เพื่อส่งหรือไม่ส่ง')).toBeNull()
  })
})
