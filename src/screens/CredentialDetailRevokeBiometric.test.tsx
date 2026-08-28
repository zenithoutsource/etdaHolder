import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Pressable as MockPressable, Text as MockText } from 'react-native'

import CredentialDetailScreen from '../../app/(tabs)/credential/[id]'

const mockReact = React
const mockRefresh = jest.fn()
const mockPush = jest.fn()
const mockConfirmCredentialRevokeBiometric = jest.fn()
const mockIsCredentialRevokeBiometricCancellation = jest.fn()
const mockHasWalletPin = jest.fn(() => true)
const mockSetWalletPin = jest.fn()
const mockVerifyWalletPin = jest.fn()

const BIOMETRIC_FALLBACK_MESSAGE =
  'Biometric verification failed. Enter your PIN instead.'

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => () => null)

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'credential-1' }),
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockReact.useEffect(() => effect(), [])
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../src/components/AppButton', () => ({
  AppButton: ({
    accessibilityLabel,
    label,
    onPress,
  }: {
    accessibilityLabel?: string
    label?: string
    onPress: () => void
  }) => (
    <MockPressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      onPress={onPress}
    >
      <MockText>{label}</MockText>
    </MockPressable>
  ),
}))

jest.mock('../../src/components/AppDialog', () => ({
  useAppDialog: () => ({ showDialog: jest.fn() }),
}))

jest.mock('../../src/components/CredentialDocumentDetailCard', () => ({
  CredentialDocumentDetailCard: ({ bannerAction }: { bannerAction?: unknown }) =>
    bannerAction ?? null,
}))

jest.mock('../../src/components/CredentialActionMenu', () => ({
  CredentialActionMenu: ({ onRevoke }: { onRevoke: () => void }) => (
    <MockPressable testID="credential-revoke-action" onPress={onRevoke}>
      <MockText>Revoke</MockText>
    </MockPressable>
  ),
}))

jest.mock('../../src/components/PresentationApprovalDeviceCard', () => ({
  PresentationApprovalDeviceCard: () => null,
}))

jest.mock('../../src/components/PresentationPopCard', () => ({
  PresentationPopCard: () => null,
}))

jest.mock('../../src/components/WalletHeader', () => ({
  WalletHeader: () => null,
}))

jest.mock('../../src/components/VpQrModal', () => ({
  VpQrModal: () => null,
}))

jest.mock('../../src/config/runtimeFlags', () => ({
  isBiometricDisabledForTesting: jest.fn(() => false),
}))

jest.mock('../../src/services/credentials/credentialDeletionBiometric', () => ({
  confirmCredentialDeletionBiometric: jest.fn(),
  isCredentialDeletionBiometricCancellation: jest.fn(() => false),
}))

jest.mock('../../src/services/credentials/credentialRevokeBiometric', () => ({
  confirmCredentialRevokeBiometric: () => mockConfirmCredentialRevokeBiometric(),
  isCredentialRevokeBiometricCancellation: (error: unknown) =>
    mockIsCredentialRevokeBiometricCancellation(error),
}))

jest.mock('../../src/services/crypto/crypto', () => ({
  getWalletKeyRegisteredAt: jest.fn(),
  hasWalletKey: jest.fn(() => false),
}))

jest.mock('../../src/services/credentials/credentialInactiveState', () => ({
  readCredentialInactiveState: () => ({ kind: 'active' }),
  resolveCredentialRevokeBehavior: jest.fn(),
}))

jest.mock('../../src/services/credentials/credentialDeletion', () => ({
  deleteStoredCredentialAfterHolderApproval: jest.fn(),
}))

jest.mock('../../src/services/credentials/credentialLifecycle', () => ({
  isCredentialPresentable: jest.fn(() => false),
  readCredentialLifecycleStatuses: () => ({}),
  recordCredentialLifecycleAction: jest.fn(),
}))

jest.mock('../../src/services/credentials/credentialKeyRenewal', () => ({
  readCredentialRenewal: () => undefined,
  readCredentialRenewalStatuses: () => ({}),
}))

jest.mock('../../src/services/credentials/credentialRenewalService', () => ({
  claimReadyRenewal: jest.fn(),
  confirmOldCredentialCleanup: jest.fn(),
  refreshAndCompleteRenewals: jest.fn().mockResolvedValue(undefined),
  submitRenewalRequest: jest.fn(),
}))

jest.mock('../../src/services/credentials/holderRevokeService', () => ({
  HolderRevokeHardwareKeyRequiredError: class HolderRevokeHardwareKeyRequiredError extends Error {},
  HolderRevokeSigningCancelledError: class HolderRevokeSigningCancelledError extends Error {},
  submitHolderRevokeRequest: jest.fn(),
}))

jest.mock('../../src/services/credentials/credentialGuard', () => ({
  canSubmitCredentialRenewal: () => false,
}))

jest.mock('../../src/services/credentials/credentialDocumentExpiry', () => ({
  isCredentialExpiringSoon: () => false,
  isCredentialDocumentExpired: () => false,
}))

jest.mock('../../src/services/credentials/renewalCleanupNotification', () => ({
  isRenewalAwaitingHolderCleanup: () => false,
}))

jest.mock('../../src/services/credentials/documentReissueCtaGate', () => ({
  shouldOfferDocumentReissueCta: () => false,
}))

jest.mock('../../src/services/credentials/walletHomeCopy', () => ({
  WALLET_HOME_COPY: {
    acknowledge: 'OK',
    cancel: 'Cancel',
    confirmDelete: 'Delete',
    renewalDeleteTitle: 'Delete',
    renewalCleanupCta: 'Clean up',
    requestCredential: 'Request',
    requestNewCredential: 'Request new',
    staleExpiryNotificationMessage: 'Expired',
    staleExpiryNotificationTitle: 'Expired',
  },
  readWalletHomeBadgeLabel: jest.fn(),
}))

jest.mock('../../src/services/credentials/credentialRenewalPresentation', () => ({
  shouldHideCredentialActionMenu: () => false,
  shouldShowRenewedActiveBadge: () => false,
}))

jest.mock('../../src/services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

jest.mock('../../src/services/notifications/notificationDocumentExpiryRoute', () => ({
  isStaleDocumentExpiryNotification: () => false,
}))

jest.mock('../../src/services/notifications/notificationRenewalRoute', () => ({
  resolveRenewalReadyReplacementRoute: () => undefined,
}))

jest.mock('../../src/services/credentials/credentialDisplay', () => ({
  readCredentialDetailDisplay: () => ({
    documentTitle: 'Test document',
    imageKey: 'id',
  }),
  readCredentialHolderProfile: () => ({}),
}))

jest.mock('../../src/services/credentials/credentialDetailSession', () => ({
  shouldResetCredentialDetailSession: () => false,
}))

jest.mock('../../src/services/credentials/issuerSuspension', () => ({
  acknowledgeIssuerSuspension: jest.fn(),
  readIssuerSuspension: () => undefined,
}))

jest.mock('../../src/services/auth/walletPin', () => ({
  hasWalletPin: () => mockHasWalletPin(),
  setWalletPin: (pin: string) => mockSetWalletPin(pin),
  verifyWalletPin: (pin: string) => mockVerifyWalletPin(pin),
}))

jest.mock('../../src/hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({
    credentials: [
      {
        id: 'credential-1',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    error: undefined,
    refresh: mockRefresh,
  }),
}))

jest.mock('../../src/services/proximity/proximityPresentation', () => ({
  isProximityPresentationSupported: () => false,
}))

jest.mock('../../src/services/proximity/mdocStorage', () => ({
  hasStoredMdoc: jest.fn().mockResolvedValue(false),
}))

jest.mock('../../src/services/vp/presentationEvidence', () => ({
  readCompactTokenSignature: jest.fn(() => 'signature'),
  readCredentialPresentationSignature: jest.fn(() => 'signature'),
}))

jest.mock('../../src/services/vp/sdJwtCredential', () => ({
  isSdJwtCredential: () => false,
}))

jest.mock('../../src/config/themeColors', () => ({
  THEME: { navy: '#000', danger: '#f00', gold: '#fc0' },
}))

function renderRevokeSecurityScreen() {
  render(<CredentialDetailScreen />)
  fireEvent.press(screen.getByLabelText('Open credential actions'))
  fireEvent.press(screen.getByTestId('credential-revoke-action'))
}

describe('CredentialDetailScreen revoke biometric', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockHasWalletPin.mockReturnValue(true)
    mockConfirmCredentialRevokeBiometric.mockResolvedValue(undefined)
    mockIsCredentialRevokeBiometricCancellation.mockImplementation(
      (error: unknown) =>
        error instanceof Error && error.message === 'CredentialRevokeBiometricCancelled',
    )
  })

  test('enters PIN/biometric security before revoke approval', () => {
    renderRevokeSecurityScreen()

    expect(screen.getByTestId('pin-key-fingerprint')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
  })

  test('moves to revoke approval after biometric success', async () => {
    mockConfirmCredentialRevokeBiometric.mockResolvedValueOnce(undefined)

    renderRevokeSecurityScreen()
    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    })
  })

  test('keeps PIN available without an error after biometric cancellation', async () => {
    mockConfirmCredentialRevokeBiometric.mockRejectedValueOnce(
      new Error('CredentialRevokeBiometricCancelled'),
    )
    mockIsCredentialRevokeBiometricCancellation.mockReturnValueOnce(true)

    renderRevokeSecurityScreen()
    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

    await waitFor(() => {
      expect(screen.getByTestId('pin-key-1')).toBeTruthy()
    })
    expect(screen.queryByText(BIOMETRIC_FALLBACK_MESSAGE)).toBeNull()
  })

  test('keeps PIN available with a friendly message after biometric failure', async () => {
    mockConfirmCredentialRevokeBiometric.mockRejectedValueOnce(
      new Error('CredentialRevokeBiometricFailed'),
    )
    mockIsCredentialRevokeBiometricCancellation.mockReturnValueOnce(false)

    renderRevokeSecurityScreen()
    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

    expect(
      await screen.findByText(BIOMETRIC_FALLBACK_MESSAGE),
    ).toBeTruthy()
    expect(screen.getByTestId('pin-key-1')).toBeTruthy()
  })

  test('hides biometric control during PIN setup and confirmation', () => {
    mockHasWalletPin.mockReturnValue(false)

    renderRevokeSecurityScreen()

    expect(screen.queryByTestId('pin-key-fingerprint')).toBeNull()

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }

    expect(screen.queryByTestId('pin-key-fingerprint')).toBeNull()

    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      fireEvent.press(screen.getByTestId(`pin-key-${digit}`))
    }

    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
  })

  test('opens History on the lifecycle filter after revoke approval', async () => {
    mockConfirmCredentialRevokeBiometric.mockResolvedValueOnce(undefined)

    renderRevokeSecurityScreen()
    fireEvent.press(screen.getByTestId('pin-key-fingerprint'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    })
    fireEvent.press(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(tabs)/history',
        params: { filter: 'lifecycle' },
      })
    })
  })
})
