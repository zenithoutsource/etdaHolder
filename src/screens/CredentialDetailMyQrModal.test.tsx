import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Pressable as MockPressable, Text as MockText } from 'react-native'

import CredentialDetailScreen from '../../app/(tabs)/credential/[id]'

const mockReact = React
const mockPush = jest.fn()
const mockRefresh = jest.fn()

let mockCredentialType: 'ThaiNationalID' | 'DLTDrivingLicence' = 'ThaiNationalID'
let mockDocumentExpired = false
let mockInactiveKind: 'active' | 'document-expired' = 'active'

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
  CredentialDocumentDetailCard: ({
    onOpenQr,
    bannerAction,
  }: {
    onOpenQr?: () => void
    bannerAction?: unknown
  }) => (
    <>
      {bannerAction}
      {onOpenQr ? (
        <MockPressable testID="document-detail-my-qr" onPress={onOpenQr}>
          <MockText>My QR</MockText>
        </MockPressable>
      ) : null}
    </>
  ),
}))

jest.mock('../../src/components/CredentialActionMenu', () => ({
  CredentialActionMenu: () => null,
}))

jest.mock('../../src/components/PinEntrySurface', () => ({
  PinEntrySurface: () => null,
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

jest.mock('../../src/components/WalletKeyExpiredActionPanel', () => ({
  WalletKeyExpiredActionPanel: () => null,
}))

jest.mock('../../src/components/VpQrModal', () => ({
  VpQrModal: ({ visible }: { visible: boolean }) => (
    <MockText testID="vp-qr-modal">{visible ? 'open' : 'closed'}</MockText>
  ),
}))

jest.mock('../../src/config/runtimeFlags', () => ({
  isBiometricDisabledForTesting: jest.fn(() => false),
}))

jest.mock('../../src/services/credentials/credentialDeletionBiometric', () => ({
  confirmCredentialDeletionBiometric: jest.fn(),
  isCredentialDeletionBiometricCancellation: jest.fn(() => false),
}))

jest.mock('../../src/services/credentials/credentialRevokeBiometric', () => ({
  confirmCredentialRevokeBiometric: jest.fn(),
  isCredentialRevokeBiometricCancellation: jest.fn(() => false),
}))

jest.mock('../../src/services/crypto/crypto', () => ({
  getWalletKeyRegisteredAt: jest.fn(),
  hasWalletKey: jest.fn(() => false),
}))

jest.mock('../../src/services/credentials/credentialInactiveState', () => ({
  readCredentialInactiveState: () =>
    mockInactiveKind === 'document-expired'
      ? {
          kind: 'document-expired',
          badgeLabel: 'หมดอายุ',
          badgeClassName: 'bg-gray-badge',
          panelMessage: 'เอกสารหมดอายุแล้ว กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
        }
      : { kind: 'active' },
  resolveCredentialRevokeBehavior: jest.fn(),
}))

jest.mock('../../src/services/credentials/credentialDeletion', () => ({
  deleteStoredCredentialAfterHolderApproval: jest.fn(),
}))

jest.mock('../../src/services/credentials/credentialLifecycle', () => ({
  isCredentialPresentable: jest.fn(() => true),
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
  readPidGateStatus: () => 'ready',
}))

jest.mock('../../src/services/credentials/pidGateDialog', () => ({
  shouldShowHomePidGateDialog: () => false,
  showPidGateDialog: jest.fn(),
}))

jest.mock('../../src/services/credentials/credentialDocumentExpiry', () => ({
  isCredentialExpiringSoon: () => false,
  isCredentialDocumentExpired: () => mockDocumentExpired,
}))

jest.mock('../../src/services/credentials/renewalCleanupNotification', () => ({
  isRenewalAwaitingHolderCleanup: () => false,
}))

jest.mock('../../src/services/credentials/documentReissueCtaGate', () => ({
  shouldOfferDocumentReissueCta: () => false,
  shouldShowWalletKeyExpiredPrompt: () => false,
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
  hasWalletPin: () => true,
  setWalletPin: jest.fn(),
  verifyWalletPin: jest.fn(),
}))

jest.mock('../../src/hooks/useScreenCaptureGuard', () => ({
  useScreenCaptureGuard: jest.fn(),
}))

jest.mock('../../src/hooks/useWalletKeyExpired', () => ({
  useWalletKeyExpired: () => ({ isExpired: false }),
}))

jest.mock('../../src/hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({
    credentials: [
      {
        id: 'credential-1',
        type: mockCredentialType,
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    error: undefined,
    refresh: mockRefresh,
  }),
}))

jest.mock('../../src/services/proximity/mdocCredential', () => ({
  canShowNfcPresentButton: () => false,
}))

jest.mock('../../src/services/proximity/proximityPresentation', () => ({
  isProximityPresentationSupported: () => false,
}))

jest.mock('../../src/services/proximity/mdocStorage', () => ({
  hasStoredMdoc: jest.fn().mockResolvedValue(false),
}))

jest.mock('../../src/services/vp/presentationEvidence', () => ({
  readCompactTokenSignature: jest.fn(() => 'signature'),
}))

jest.mock('../../src/services/vp/sdJwtCredential', () => ({
  isSdJwtCredential: () => false,
}))

jest.mock('../../src/services/credentials/requestCredentialViaPortalFlow', () => ({
  requestCredentialViaPortalFlow: jest.fn(),
}))

jest.mock('../../src/services/crypto/walletKeyExpiryLane', () => ({
  readWalletKeyExpiryLane: () => 'ok',
}))

jest.mock('../../src/services/crypto/walletKeyRotation', () => ({
  readWalletKeyRotationRecord: () => undefined,
}))

jest.mock('../../src/services/crypto/walletKeyRotationFlow', () => ({
  performWalletKeyRotationWithDialog: jest.fn(),
}))

jest.mock('../../src/config/themeColors', () => ({
  THEME: { navy: '#000', danger: '#f00', gold: '#fc0' },
}))

describe('CredentialDetailScreen My QR modal', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCredentialType = 'ThaiNationalID'
    mockDocumentExpired = false
    mockInactiveKind = 'active'
  })

  test.each([
    ['ThaiNationalID'],
    ['DLTDrivingLicence'],
  ] as const)('opens VpQrModal from %s detail without navigating to My QR tab', async (credentialType) => {
    mockCredentialType = credentialType

    render(<CredentialDetailScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('vp-qr-modal')).toHaveTextContent('closed')
    })

    fireEvent.press(screen.getByTestId('document-detail-my-qr'))

    await waitFor(() => {
      expect(screen.getByTestId('vp-qr-modal')).toHaveTextContent('open')
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  test.each([
    ['ThaiNationalID'],
    ['DLTDrivingLicence'],
  ] as const)('hides My QR on expired %s detail', async (credentialType) => {
    mockCredentialType = credentialType
    mockDocumentExpired = true
    mockInactiveKind = 'document-expired'

    render(<CredentialDetailScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('vp-qr-modal')).toHaveTextContent('closed')
    })
    expect(screen.queryByTestId('document-detail-my-qr')).toBeNull()
  })

  test('hides My QR when the document is calendar-expired even if inactive state is still active', async () => {
    mockDocumentExpired = true
    mockInactiveKind = 'active'

    render(<CredentialDetailScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('vp-qr-modal')).toHaveTextContent('closed')
    })
    expect(screen.queryByTestId('document-detail-my-qr')).toBeNull()
  })
})
