import { render, screen, fireEvent } from '@testing-library/react-native'

import { PresentationDisclosureList } from './PresentationDisclosureList'

jest.mock('react-native-gesture-handler', () => {
  throw new Error('PresentationDisclosureList must not require gesture-handler Pressable')
})

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

  test('calls onToggle for selectable consent rows', () => {
    const onToggle = jest.fn()
    render(
      <PresentationDisclosureList
        variant="consent"
        onToggle={onToggle}
        items={[
          { key: 'gpa', label: 'เกรดเฉลี่ย', value: '3.75', selected: true, toggleable: true },
          { key: 'student_id', label: 'รหัสนักศึกษา', value: '65010001', selected: true, toggleable: false },
        ]}
      />,
    )

    fireEvent.press(screen.getByLabelText('เกรดเฉลี่ย'))
    expect(onToggle).toHaveBeenCalledWith('gpa')

    fireEvent.press(screen.getByText('รหัสนักศึกษา'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  test('review variant toggles selectable rows without changing row chrome', () => {
    const onToggle = jest.fn()
    render(
      <PresentationDisclosureList
        variant="review"
        onToggle={onToggle}
        items={[
          { key: 'gpa', label: 'เกรดเฉลี่ย', value: '3.75', selected: true, toggleable: true },
          { key: 'student_id', label: 'รหัส', value: '123', selected: true, toggleable: false },
        ]}
      />,
    )

    fireEvent.press(screen.getByLabelText('เกรดเฉลี่ย'))
    expect(onToggle).toHaveBeenCalledWith('gpa')

    fireEvent.press(screen.getByText('รหัส'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  test('review variant renders mandatory rows with lock badge and no checkbox role', () => {
    render(
      <PresentationDisclosureList
        variant="review"
        onToggle={jest.fn()}
        items={[
          { key: 'national_id', label: 'เลขบัตรประชาชน', value: '1234567890123', selected: true, toggleable: false },
        ]}
      />,
    )

    expect(screen.getByText('จำเป็น')).toBeTruthy()
    expect(screen.getByTestId('mandatory-badge-national_id')).toBeTruthy()
    expect(screen.getByLabelText('เลขบัตรประชาชน, จำเป็น')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
