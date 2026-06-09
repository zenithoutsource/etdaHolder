import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'

import { AppDialogProvider, useAppDialog } from './AppDialog'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

function DialogHarness() {
  const { showDialog } = useAppDialog()

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          showDialog({
            title: 'Confirm action',
            message: 'This cannot be undone.',
            icon: 'warning',
            actions: [
              { label: 'Cancel', variant: 'secondary' },
              { label: 'Delete', variant: 'danger', onPress: jest.fn() },
            ],
          })
        }>
        <Text>Open dialog</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          showDialog({
            title: 'Wait here',
            actions: [{ label: 'Stay open', dismissOnPress: false }],
          })
        }>
        <Text>Open persistent dialog</Text>
      </Pressable>
    </>
  )
}

describe('AppDialogProvider', () => {
  test('renders no dialog by default', () => {
    render(
      <AppDialogProvider>
        <Text>Screen content</Text>
      </AppDialogProvider>,
    )

    expect(screen.queryByTestId('app-dialog')).toBeNull()
    expect(screen.getByText('Screen content')).toBeTruthy()
  })

  test('shows dialog content and dismisses secondary action', async () => {
    render(
      <AppDialogProvider>
        <DialogHarness />
      </AppDialogProvider>,
    )

    fireEvent.press(screen.getByText('Open dialog'))

    expect(screen.getByTestId('app-dialog')).toBeTruthy()
    expect(screen.getByText('Confirm action')).toBeTruthy()
    expect(screen.getByText('This cannot be undone.')).toBeTruthy()

    fireEvent.press(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByTestId('app-dialog')).toBeNull()
    })
  })

  test('calls an action callback before dismissing', async () => {
    const onPress = jest.fn()

    function ActionHarness() {
      const { showDialog } = useAppDialog()
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            showDialog({
              title: 'Saved',
              actions: [{ label: 'Done', onPress }],
            })
          }>
          <Text>Open save dialog</Text>
        </Pressable>
      )
    }

    render(
      <AppDialogProvider>
        <ActionHarness />
      </AppDialogProvider>,
    )

    fireEvent.press(screen.getByText('Open save dialog'))
    fireEvent.press(screen.getByText('Done'))

    await waitFor(() => {
      expect(onPress).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId('app-dialog')).toBeNull()
    })
  })

  test('keeps dialog open when dismissOnPress is false', async () => {
    render(
      <AppDialogProvider>
        <DialogHarness />
      </AppDialogProvider>,
    )

    fireEvent.press(screen.getByText('Open persistent dialog'))
    fireEvent.press(screen.getByText('Stay open'))

    await waitFor(() => {
      expect(screen.getByTestId('app-dialog')).toBeTruthy()
    })
  })
})
