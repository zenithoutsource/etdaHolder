import { fireEvent, render, screen } from '@testing-library/react-native'

import { CredentialActionMenu } from './CredentialActionMenu'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons')

describe('CredentialActionMenu', () => {
  test('renders revoke and delete actions for a loaded credential', () => {
    const onRevoke = jest.fn()
    const onDelete = jest.fn()

    render(
      <CredentialActionMenu
        onRevoke={onRevoke}
        onDelete={onDelete}
      />,
    )

    fireEvent.press(screen.getByText('Revoke'))
    fireEvent.press(screen.getByText('ลบเอกสารนี้'))

    expect(onRevoke).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
