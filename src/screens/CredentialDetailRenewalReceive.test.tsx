import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import React from 'react'
import { Pressable as MockPressable, Text as MockText } from 'react-native'

import CredentialDetailScreen from '../../app/(tabs)/credential/[id]'

const mockReact = React
const mockRefresh = jest.fn()
const mockClaimReadyRenewal = jest.fn()
const mockRefreshAndCompleteRenewals = jest.fn()
const mockShowDialog = jest.fn()
const mockLogWalletError = jest.fn()
let mockRenewalStatus:
  | {
      credentialId: string
      previousHolderDid: string
      readyOfferUri?: string
      state: 'renewal-processing' | 'renewal-required'
      updatedAt: string
    }
  | undefined

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => () => null)

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'credential-1', notificationEvent: 'renewal-ready' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockReact.useEffect(() => effect(), [])
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../src/components/AppButton', () => ({
  AppButton: ({ accessibilityLabel, label, onPress }: { accessibilityLabel?: string; label?: string; onPress: () => void }) => {
    return <MockPressable accessibilityLabel={accessibilityLabel ?? label} accessibilityRole="button" onPress={onPress}><MockText>{label}</MockText></MockPressable>
  },
}))
jest.mock('../../src/components/AppDialog', () => ({ useAppDialog: () => ({ showDialog: mockShowDialog }) }))
jest.mock('../../src/components/CredentialDocumentDetailCard', () => ({ CredentialDocumentDetailCard: () => null }))
jest.mock('../../src/components/CredentialActionMenu', () => ({ CredentialActionMenu: () => null }))
jest.mock('../../src/components/PinEntrySurface', () => ({ PinEntrySurface: () => null }))
jest.mock('../../src/components/PresentationApprovalDeviceCard', () => ({ PresentationApprovalDeviceCard: () => null }))
jest.mock('../../src/components/PresentationPopCard', () => ({ PresentationPopCard: () => null }))
jest.mock('../../src/components/WalletHeader', () => ({ WalletHeader: () => null }))
jest.mock('../../src/components/VpQrModal', () => ({ VpQrModal: () => null }))

jest.mock('../../src/services/crypto/crypto', () => ({ getWalletKeyRegisteredAt: jest.fn() }))
jest.mock('../../src/services/credentials/credentialInactiveState', () => ({
  readCredentialInactiveState: () => ({ kind: 'renewal-processing', panelMessage: 'Renewal processing' }),
  resolveCredentialRevokeBehavior: jest.fn(),
}))
jest.mock('../../src/services/credentials/credentialDeletion', () => ({ deleteStoredCredentialAfterHolderApproval: jest.fn() }))
jest.mock('../../src/services/credentials/credentialLifecycle', () => ({
  isCredentialPresentable: jest.fn(() => false),
  readCredentialLifecycleStatuses: () => ({}),
  recordCredentialLifecycleAction: jest.fn(),
}))
jest.mock('../../src/services/credentials/credentialKeyRenewal', () => ({
  readCredentialRenewal: () => mockRenewalStatus,
  readCredentialRenewalStatuses: () => (mockRenewalStatus ? { [mockRenewalStatus.credentialId]: mockRenewalStatus } : {}),
}))
jest.mock('../../src/services/credentials/credentialRenewalService', () => ({
  claimReadyRenewal: (...args: unknown[]) => mockClaimReadyRenewal(...args),
  confirmOldCredentialCleanup: jest.fn(),
  refreshAndCompleteRenewals: (...args: unknown[]) => mockRefreshAndCompleteRenewals(...args),
  submitRenewalRequest: jest.fn(),
}))
jest.mock('../../src/services/credentials/holderRevokeService', () => ({
  HolderRevokeSigningCancelledError: class HolderRevokeSigningCancelledError extends Error {},
  submitHolderRevokeRequest: jest.fn(),
}))
jest.mock('../../src/services/credentials/credentialGuard', () => ({ canSubmitCredentialRenewal: () => false }))
jest.mock('../../src/services/credentials/credentialDocumentExpiry', () => ({ isCredentialExpiringSoon: () => false }))
jest.mock('../../src/services/credentials/renewalCleanupNotification', () => ({ isRenewalAwaitingHolderCleanup: () => false }))
jest.mock('../../src/services/credentials/walletHomeCopy', () => ({
  WALLET_HOME_COPY: { acknowledge: 'OK', cancel: 'Cancel', requestCredential: 'Request', requestNewCredential: 'Request new', renewalCleanupCta: 'Clean up' },
  readWalletHomeBadgeLabel: jest.fn(),
}))
jest.mock('../../src/services/credentials/credentialRenewalPresentation', () => ({
  shouldHideCredentialActionMenu: () => true,
  shouldShowRenewedActiveBadge: () => false,
}))
jest.mock('../../src/services/debug/walletLogger', () => ({
  logWalletError: (...args: unknown[]) => mockLogWalletError(...args),
}))
jest.mock('../../src/services/notifications/notificationDocumentExpiryRoute', () => ({ isStaleDocumentExpiryNotification: () => false }))
jest.mock('../../src/services/notifications/notificationRenewalRoute', () => ({ resolveRenewalReadyReplacementRoute: () => undefined }))
jest.mock('../../src/services/credentials/credentialDisplay', () => ({
  readCredentialDetailDisplay: () => ({ documentTitle: 'Test document', imageKey: 'id' }),
  readCredentialHolderProfile: () => ({}),
}))
jest.mock('../../src/services/credentials/credentialDetailSession', () => ({ shouldResetCredentialDetailSession: () => false }))
jest.mock('../../src/services/credentials/issuerSuspension', () => ({ acknowledgeIssuerSuspension: jest.fn(), readIssuerSuspension: () => undefined }))
jest.mock('../../src/services/auth/walletPin', () => ({ hasWalletPin: () => true, setWalletPin: jest.fn(), verifyWalletPin: jest.fn() }))
jest.mock('../../src/hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({
    credentials: [{ id: 'credential-1', type: 'ThaiNationalID', rawVc: 'vc', claims: {}, issuedAt: '2026-01-01T00:00:00.000Z' }],
    error: undefined,
    refresh: mockRefresh,
  }),
}))
jest.mock('../../src/services/proximity/proximityPresentation', () => ({ isProximityPresentationSupported: () => false }))
jest.mock('../../src/services/proximity/proximityArmSession', () => ({ armProximityTestSession: jest.fn(), NFC_TEST_ARM_WINDOW_SECONDS: 60 }))
jest.mock('../../src/services/proximity/mdocStorage', () => ({ hasStoredMdoc: jest.fn(() => new Promise(() => {})) }))
jest.mock('../../src/services/vp/presentationEvidence', () => ({ readCompactTokenSignature: jest.fn() }))
jest.mock('../../src/services/vp/walletInitiatedPresentation', () => ({ isSdJwtCredential: () => false }))
jest.mock('../../src/config/themeColors', () => ({ THEME: { navy: '#000', danger: '#f00' } }))

describe('CredentialDetailScreen renewal receive action', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockClaimReadyRenewal.mockResolvedValue(undefined)
    mockRefreshAndCompleteRenewals.mockResolvedValue(undefined)
    mockRenewalStatus = {
      credentialId: 'credential-1',
      previousHolderDid: 'did:key:zold',
      state: 'renewal-processing',
      updatedAt: '2026-07-13T00:00:00.000Z',
    }
  })

  test('keeps renewal-ready detail focus passive until the Holder presses Receive new document', async () => {
    mockRenewalStatus = { ...mockRenewalStatus!, readyOfferUri: '  openid-credential-offer://ready  ' }

    render(<CredentialDetailScreen />)

    await waitFor(() => {
      expect(mockRefreshAndCompleteRenewals).toHaveBeenCalled()
    })
    expect(mockClaimReadyRenewal).not.toHaveBeenCalled()

    fireEvent.press(screen.getByRole('button', { name: 'Receive new document' }))

    await waitFor(() => {
      expect(mockClaimReadyRenewal).toHaveBeenCalledWith('credential-1')
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  test('shows renewal processing while the explicit receive claim is pending', async () => {
    mockRenewalStatus = { ...mockRenewalStatus!, readyOfferUri: 'openid-credential-offer://ready' }
    let resolveClaim: (() => void) | undefined
    mockClaimReadyRenewal.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveClaim = resolve
      }),
    )

    render(<CredentialDetailScreen />)

    await waitFor(() => expect(mockRefreshAndCompleteRenewals).toHaveBeenCalled())
    mockRefresh.mockClear()
    fireEvent.press(screen.getByRole('button', { name: 'Receive new document' }))

    await waitFor(() => expect(mockClaimReadyRenewal).toHaveBeenCalledWith('credential-1'))
    expect(screen.getByText('กำลังส่งคำขอต่ออายุเอกสารไปยังผู้ออกเอกสาร')).toBeTruthy()

    resolveClaim?.()

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })

  test('refreshes cleared readiness after a rejected receive claim before returning to detail', async () => {
    mockRenewalStatus = { ...mockRenewalStatus!, readyOfferUri: 'openid-credential-offer://ready' }
    const renewalError = new Error('renewal claim rejected')
    mockClaimReadyRenewal.mockImplementation(async () => {
      mockRenewalStatus = {
        ...mockRenewalStatus!,
        state: 'renewal-required',
        readyOfferUri: undefined,
      }
      throw renewalError
    })

    render(<CredentialDetailScreen />)

    await waitFor(() => expect(mockRefreshAndCompleteRenewals).toHaveBeenCalled())
    mockRefresh.mockClear()
    fireEvent.press(screen.getByRole('button', { name: 'Receive new document' }))

    await waitFor(() => {
      expect(mockShowDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Unable to receive new document' }))
      expect(mockLogWalletError).toHaveBeenCalledWith(
        'credential-detail',
        'renewal-receive-failed',
        renewalError,
        { credentialId: 'credential-1' },
      )
      expect(mockRefresh).toHaveBeenCalled()
    })
    expect(screen.queryByText('กำลังส่งคำขอต่ออายุเอกสารไปยังผู้ออกเอกสาร')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Receive new document' })).toBeNull()
  })

  test('does not show Receive new document without a usable readiness marker', async () => {
    render(<CredentialDetailScreen />)

    await waitFor(() => expect(mockRefreshAndCompleteRenewals).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Receive new document' })).toBeNull()
  })

  test('does not show Receive new document for a whitespace-only readiness marker', async () => {
    mockRenewalStatus = { ...mockRenewalStatus!, readyOfferUri: '   ' }

    render(<CredentialDetailScreen />)

    await waitFor(() => expect(mockRefreshAndCompleteRenewals).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: 'Receive new document' })).toBeNull()
  })

  test('does not show Receive new document outside renewal processing', async () => {
    mockRenewalStatus = {
      ...mockRenewalStatus!,
      state: 'renewal-required',
      readyOfferUri: 'openid-credential-offer://ready',
    }

    render(<CredentialDetailScreen />)

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(mockRefreshAndCompleteRenewals).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Receive new document' })).toBeNull()
  })
})
