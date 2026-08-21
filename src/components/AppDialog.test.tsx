import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Pressable, Text } from 'react-native'

import { hasWalletPin } from '../services/auth/walletPin'
import { useAuthStore } from '../store/authStore'
import { useDeeplinkStore } from '../store/deeplinkStore'
import { AppDialogProvider, useAppDialog } from './AppDialog'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  return function MockMaterialCommunityIcons() {
    return null
  }
})

jest.mock('../services/auth/walletPin', () => ({
  hasWalletPin: jest.fn(() => false),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

const mockHasWalletPin = hasWalletPin as jest.MockedFunction<typeof hasWalletPin>

function lockWalletPinSession() {
  mockHasWalletPin.mockReturnValue(true)
  useAuthStore.setState({
    isAuthenticated: true,
    isPinVerified: false,
  })
}

function unlockWalletPinSession() {
  mockHasWalletPin.mockReturnValue(true)
  useAuthStore.setState({
    isAuthenticated: true,
    isPinVerified: true,
  })
}

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
  beforeEach(() => {
    mockHasWalletPin.mockReturnValue(false)
    useAuthStore.setState({
      token: null,
      walletId: null,
      accountId: null,
      isAuthenticated: false,
      isLoading: false,
      isPinVerified: false,
    })
    useDeeplinkStore.setState({
      pendingUri: null,
      activeUri: null,
      dismissedUri: null,
      offerGeneration: 0,
      vpGeneration: 0,
    })
  })

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

  test('hides a visible dialog when the wallet PIN session locks', async () => {
    unlockWalletPinSession()

    render(
      <AppDialogProvider>
        <DialogHarness />
      </AppDialogProvider>,
    )

    fireEvent.press(screen.getByText('Open dialog'))
    expect(screen.getByTestId('app-dialog')).toBeTruthy()

    act(() => {
      lockWalletPinSession()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('app-dialog')).toBeNull()
    })
    expect(screen.queryByText('Delete')).toBeNull()
  })

  test('does not render a dialog shown while PIN lock is required until unlock', async () => {
    lockWalletPinSession()

    render(
      <AppDialogProvider>
        <DialogHarness />
      </AppDialogProvider>,
    )

    fireEvent.press(screen.getByText('Open dialog'))
    expect(screen.queryByTestId('app-dialog')).toBeNull()

    act(() => {
      unlockWalletPinSession()
    })

    await waitFor(() => {
      expect(screen.getByTestId('app-dialog')).toBeTruthy()
      expect(screen.getByText('Confirm action')).toBeTruthy()
    })
  })

  test('does not restore a deferred dialog after unlock when a pending offer is queued', async () => {
    lockWalletPinSession()

    render(
      <AppDialogProvider>
        <DialogHarness />
      </AppDialogProvider>,
    )

    fireEvent.press(screen.getByText('Open dialog'))
    expect(screen.queryByTestId('app-dialog')).toBeNull()

    act(() => {
      useDeeplinkStore.setState({
        pendingUri: 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
      })
      unlockWalletPinSession()
    })

    await waitFor(() => {
      expect(screen.queryByTestId('app-dialog')).toBeNull()
    })
  })

  test('does not run dialog actions while PIN lock is required', async () => {
    const onPress = jest.fn()

    function ActionHarness() {
      const { showDialog } = useAppDialog()
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            showDialog({
              title: 'Retry claim',
              actions: [{ label: 'ลองใหม่อีกครั้ง', onPress }],
            })
          }>
          <Text>Open retry dialog</Text>
        </Pressable>
      )
    }

    unlockWalletPinSession()
    render(
      <AppDialogProvider>
        <ActionHarness />
      </AppDialogProvider>,
    )

    fireEvent.press(screen.getByText('Open retry dialog'))
    expect(screen.getByText('ลองใหม่อีกครั้ง')).toBeTruthy()

    act(() => {
      lockWalletPinSession()
    })

    await waitFor(() => {
      expect(screen.queryByText('ลองใหม่อีกครั้ง')).toBeNull()
    })
    expect(onPress).not.toHaveBeenCalled()
  })
})
