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

    expect(screen.getByText('เลือกรายการเพื่อส่งตรวจสอบ')).toBeTruthy()
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

    expect(screen.getByLabelText('จำเป็น')).toBeTruthy()
    expect(screen.getByTestId('mandatory-badge-national_id')).toBeTruthy()
    expect(screen.getByText('ยอมรับ')).not.toBeDisabled()
    expect(screen.queryByText('เลือกรายการเพื่อส่งตรวจสอบ')).toBeNull()
  })

  test('keeps issuer disclosure values even when a holder profile is passed', () => {
    render(
      <PresentationRequestedItemsCard
        documentType="DLTDrivingLicence"
        disclosures={[
          { key: 'given_name', label: 'ชื่อ', value: 'สมชาย', mandatory: true, selective: false },
          { key: 'family_name', label: 'นามสกุล', value: 'ใจดี', mandatory: true, selective: false },
        ]}
        selectedClaimKeys={new Set(['given_name', 'family_name'])}
        onToggleClaim={jest.fn()}
        onAccept={jest.fn()}
        holderProfile={{
          thaiName: 'นางสาว พิชญา รุ่งเรืองกิจ',
          englishName: 'Pitchaya Rungruangkit',
        }}
      />,
    )

    expect(screen.getByText('สมชาย')).toBeTruthy()
    expect(screen.getByText('ใจดี')).toBeTruthy()
    expect(screen.queryByText('นางสาว พิชญา')).toBeNull()
    expect(screen.queryByText('รุ่งเรืองกิจ')).toBeNull()
  })

  test('hides religion on requested items even when the verifier asked for it', () => {
    render(
      <PresentationRequestedItemsCard
        documentType="ThaiNationalID"
        disclosures={[
          { key: 'national_id', label: 'ID', value: '123', mandatory: true, selective: false },
          { key: 'religion', label: 'Religion', value: 'Buddhist', mandatory: false, selective: true },
        ]}
        selectedClaimKeys={new Set(['national_id', 'religion'])}
        onToggleClaim={jest.fn()}
        onAccept={jest.fn()}
      />,
    )

    expect(screen.getByText('เลขบัตรประจำตัวประชาชน')).toBeTruthy()
    expect(screen.queryByText('ศาสนา')).toBeNull()
    expect(screen.queryByText('Buddhist')).toBeNull()
  })

  test('shows driving-licence given name above family name', () => {
    render(
      <PresentationRequestedItemsCard
        documentType="DLTDrivingLicence"
        disclosures={[
          { key: 'family_name', label: 'นามสกุล', value: 'ใจดี', mandatory: true, selective: false },
          { key: 'given_name', label: 'ชื่อ', value: 'สมชาย', mandatory: true, selective: false },
        ]}
        selectedClaimKeys={new Set(['family_name', 'given_name'])}
        onToggleClaim={jest.fn()}
        onAccept={jest.fn()}
      />,
    )

    expect(screen.getByText('ชื่อ')).toBeTruthy()
    expect(screen.getByText('นามสกุล')).toBeTruthy()
    const json = JSON.stringify(screen.toJSON())
    expect(json.indexOf('"ชื่อ"')).toBeLessThan(json.indexOf('"นามสกุล"'))
  })
})
