import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { BackHandler } from 'react-native'

import CredentialOfferRoute from '../../app/(tabs)/credential-offer'
import { CredentialOfferClaimScreen } from './CredentialOfferClaimScreen'
import { useDeeplinkStore } from '../store/deeplinkStore'
import { acquireCredentialRecord, resolveOffer } from '../services/vci/exchangeService'
import {
  acquireDualFormatForPreview,
  finalizeDualFormatCredential,
} from '../services/credentials/dualFormatIssuance'
import { WALLET_HOME_COPY } from '../services/credentials/walletHomeCopy'
import { readStoredCredentials } from '../services/credentials/storedCredentials'
import { saveScannedCredential } from '../services/credentials/scannedCredentialSave'

jest.mock('../components/AppDialog', () => ({
  useAppDialog: () => ({ showDialog: jest.fn() }),
}))

jest.mock('expo-camera', () => {
  throw new Error('CredentialOfferClaimScreen must not import expo-camera')
})

const mockRouterDismissTo = jest.fn()
const mockRouterReplace = jest.fn()
let mockRouteFocused = true

jest.mock('expo-router', () => ({
  useRouter: () => ({
    dismissTo: mockRouterDismissTo,
    replace: mockRouterReplace,
  }),
  useNavigation: () => ({
    getParent: () => null,
  }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react')
    useEffect(() => {
      if (!mockRouteFocused) return undefined
      return callback()
    }, [callback])
  },
}))

jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  useURL: jest.fn(() => null),
}))

jest.mock('../hooks/useStoredCredentials', () => ({
  useStoredCredentials: () => ({
    credentials: [],
    refresh: jest.fn(),
  }),
}))

jest.mock('../services/credentials/storedCredentials', () => ({
  readStoredCredentials: jest.fn(() => []),
}))

jest.mock('../services/debug/walletLogger', () => ({
  logWalletError: jest.fn(),
  logWalletStep: jest.fn(),
}))

jest.mock('../services/credentials/credentialGuard', () => ({
  canRequestCredentialType: jest.fn(() => true),
  isPidCredentialOffer: jest.fn((offer) =>
    offer.credentialConfigurations.some((configuration: { id: string }) =>
      configuration.id.toLowerCase().includes('thai'),
    ),
  ),
  readPidGateStatus: jest.fn(() => 'ready'),
}))

jest.mock('../services/credentials/credentialKeyRenewal', () => ({
  readCredentialRenewalStatuses: jest.fn(() => ({})),
}))

jest.mock('../services/vci/exchangeService', () => ({
  resolveOffer: jest.fn(),
  acquireCredentialRecord: jest.fn(),
  readCredentialClaimMap: (record: { claims: Record<string, unknown> }) => record.claims,
}))

jest.mock('../services/credentials/scannedCredentialSave', () => ({
  saveScannedCredential: jest.fn(),
}))

jest.mock('../services/credentials/dualFormatIssuance', () => {
  const actual = jest.requireActual<typeof import('../services/credentials/dualFormatIssuance')>(
    '../services/credentials/dualFormatIssuance',
  )
  return {
    ...actual,
    acquireDualFormatForPreview: jest.fn(),
    finalizeDualFormatCredential: jest.fn(),
  }
})

const resolveOfferMock = resolveOffer as jest.Mock
const acquireCredentialRecordMock = acquireCredentialRecord as jest.Mock
const acquireDualFormatForPreviewMock = acquireDualFormatForPreview as jest.Mock
const finalizeDualFormatCredentialMock = finalizeDualFormatCredential as jest.Mock
const readStoredCredentialsMock = readStoredCredentials as jest.Mock
const saveScannedCredentialMock = saveScannedCredential as jest.Mock
const linkingMock = jest.requireMock('expo-linking') as {
  getInitialURL: jest.Mock<Promise<string | null>, []>
  useURL: jest.Mock<string | null, []>
}
const useUrlMock = linkingMock.useURL

describe('CredentialOfferClaimScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRouteFocused = true
    linkingMock.getInitialURL.mockResolvedValue(null)
    useUrlMock.mockReturnValue(null)
    useDeeplinkStore.setState({ pendingUri: null, activeUri: null, dismissedUri: null, offerGeneration: 0, vpGeneration: 0 })
    readStoredCredentialsMock.mockReturnValue([])
    acquireDualFormatForPreviewMock.mockReset()
    finalizeDualFormatCredentialMock.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('consumes a pending credential offer deeplink and resolves it without camera permission', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID', format: 'dc+sd-jwt', rawConfiguration: {} }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
  })

  it('does not restart an in-flight offer when the same callback is delivered again', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    let finishResolve: ((offer: {
      credentialConfigurations: { id: string }[]
      issuer: string
      txCode: undefined
    }) => void) | undefined
    resolveOfferMock.mockImplementation(() => new Promise((resolve) => {
      finishResolve = resolve
    }))

    render(<CredentialOfferRoute />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledTimes(1)
    })
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(offerUri)
    })

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledTimes(1)
    })
    expect(useDeeplinkStore.getState().pendingUri).toBeNull()

    await act(async () => {
      finishResolve?.({
        credentialConfigurations: [{ id: 'ThaiNationalID' }],
        issuer: 'https://issuer.example',
        txCode: undefined,
      })
    })
  })

  it('does not restart a direct-link offer when the same callback later reaches the store', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fdirect-offer'
    useUrlMock.mockReturnValue(offerUri)
    let finishResolve: ((offer: {
      credentialConfigurations: { id: string }[]
      issuer: string
      txCode: undefined
    }) => void) | undefined
    resolveOfferMock.mockImplementation(() => new Promise((resolve) => {
      finishResolve = resolve
    }))

    render(<CredentialOfferRoute />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(offerUri)
    })

    expect(useDeeplinkStore.getState().pendingUri).toBeNull()
    expect(resolveOfferMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      finishResolve?.({
        credentialConfigurations: [{ id: 'ThaiNationalID' }],
        issuer: 'https://issuer.example',
        txCode: undefined,
      })
    })
  })

  it('clears the active offer when Android system Back exits the claim route', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fback-offer'
    let hardwareBackHandler: (() => boolean | null | undefined) | undefined
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
      hardwareBackHandler = handler
      return { remove: jest.fn() }
    })
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockRejectedValue(new Error('Issuer offline'))

    render(<CredentialOfferRoute />)

    await screen.findByText('Back to Wallet')
    expect(useDeeplinkStore.getState().activeUri).toBe(offerUri)

    act(() => {
      expect(hardwareBackHandler?.()).toBe(true)
      expect(hardwareBackHandler?.()).toBe(true)
    })

    expect(useDeeplinkStore.getState().activeUri).toBeNull()
    expect(useDeeplinkStore.getState().dismissedUri).toBe(offerUri)
    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)')
    expect(mockRouterReplace).toHaveBeenCalledTimes(1)
  })

  it('does not register Android Back while the claim route is unfocused', () => {
    mockRouteFocused = false
    const addEventListenerSpy = jest.spyOn(BackHandler, 'addEventListener')

    render(<CredentialOfferRoute />)

    expect(addEventListenerSpy).not.toHaveBeenCalled()
  })

  it('falls back to the current Linking URL when no pending store value exists', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useUrlMock.mockReturnValue(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
  })

  it('resolves a new pending offer when the hidden tab screen is already mounted', async () => {
    const idCardOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fid-card-offer'
    const transcriptOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Ftranscript-offer'
    useDeeplinkStore.getState().setPendingDeeplinkUri(idCardOfferUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(idCardOfferUri)
    })

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(transcriptOfferUri)
    })

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(transcriptOfferUri)
    })
  })

  it('waits for the initial launch URL before showing a missing pending offer error', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=http%3A%2F%2Fissuer.zenithcomp.co.th:455%2Fopenid4vc%2FcredentialOffer%3Fid%3D06c03c04-39ec-4287-b819-7bb72dd2395d'
    linkingMock.getInitialURL.mockResolvedValue(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'http://issuer.zenithcomp.co.th:455',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
    expect(screen.queryByText('No credential offer link is pending.')).toBeNull()
  })

  it('unwraps walletapp callback launch URLs before showing a missing pending offer error', async () => {
    const callbackUrl =
      'walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3Db30353bd-c066-4d73-9d2f-ff6f1f02798e'
    const offerUri =
      'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3Db30353bd-c066-4d73-9d2f-ff6f1f02798e'
    linkingMock.getInitialURL.mockResolvedValue(callbackUrl)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.zenithcomp.co.th:455',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
    expect(screen.queryByText('No credential offer link is pending.')).toBeNull()
  })

  it('resumes an active offer after remount when pending was already consumed', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useDeeplinkStore.setState({
      pendingUri: null,
      activeUri: offerUri,
      dismissedUri: null,
    })
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
    expect(screen.queryByText('No credential offer link is pending.')).toBeNull()
  })

  it('allows ThaiNationalID re-issue when only document-expired PID exists', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fid-card-offer'
    readStoredCredentialsMock.mockReturnValue([
      {
        id: 'id-card-expired',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
    ])

    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
    expect(screen.queryByText(WALLET_HOME_COPY.renewThaIdRequiredMessage)).toBeNull()
  })

  it('shows the DOPA confirmation before acquiring a driving licence', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fdriving-licence-offer'
    readStoredCredentialsMock.mockReturnValue([
      {
        id: 'active-id-card',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ])
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'DLTDrivingLicence', format: 'dc+sd-jwt', rawConfiguration: {} }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })
    acquireCredentialRecordMock.mockResolvedValue({
      id: 'driving-licence',
      type: 'DLTDrivingLicence',
      rawVc: 'vc',
      claims: {},
      issuedAt: '2026-06-09T00:00:00.000Z',
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('thai-id-confirmation-image')).toBeTruthy()
    })
    expect(acquireCredentialRecordMock).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('ยืนยัน'))

    await waitFor(() => {
      expect(acquireCredentialRecordMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('driving-licence-preview-panel')).toBeTruthy()
    })
  })

  it('shows the DOPA confirmation before acquiring a ThaiNationalID credential', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fid-card-before-acquire'
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID', format: 'dc+sd-jwt', rawConfiguration: {} }],
      issuer: 'https://issuer.example',
      supportedFlows: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      txCode: undefined,
    })
    acquireCredentialRecordMock.mockResolvedValue({
      id: 'id-card-before-acquire',
      type: 'ThaiNationalID',
      rawVc: 'vc',
      claims: {},
      issuedAt: '2026-06-09T00:00:00.000Z',
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('thai-id-confirmation-image')).toBeTruthy()
    })
    expect(acquireCredentialRecordMock).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('ยืนยัน'))
    await waitFor(() => {
      expect(acquireCredentialRecordMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('thai-id-receive-panel')).toBeTruthy()
    })
    expect(screen.queryByTestId('thai-id-confirmation-image')).toBeNull()
    expect(saveScannedCredentialMock).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('ยืนยัน'))

    await waitFor(() => {
      expect(saveScannedCredentialMock).toHaveBeenCalledTimes(1)
      expect(screen.getByText('รับเอกสารสำเร็จ')).toBeTruthy()
    })
    expect(screen.queryByTestId('thai-id-confirmation-image')).toBeNull()
  })

  it('shows the issuer confirmation after DL preview and before saving', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fdriving-licence-confirmation'
    readStoredCredentialsMock.mockReturnValue([
      {
        id: 'active-id-card',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ])
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'DLTDrivingLicence', format: 'dc+sd-jwt', rawConfiguration: {} }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })
    acquireCredentialRecordMock.mockResolvedValue({
      id: 'driving-licence-confirmation',
      type: 'DLTDrivingLicence',
      rawVc: 'vc',
      claims: {},
      issuedAt: '2026-06-09T00:00:00.000Z',
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('thai-id-confirmation-image')).toBeTruthy()
    })
    expect(acquireCredentialRecordMock).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('ยืนยัน'))

    await waitFor(() => {
      expect(acquireCredentialRecordMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('driving-licence-preview-panel')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('ยอมรับ'))

    await waitFor(() => {
      expect(screen.getByTestId('issuer-confirmation-image')).toBeTruthy()
    })
    expect(screen.getByText('กรมการขนส่งทางบก')).toBeTruthy()
    expect(screen.getByText(/ใบอนุญาตขับขี่/)).toBeTruthy()

    fireEvent.press(screen.getByText('ยืนยัน'))

    await waitFor(() => {
      expect(saveScannedCredentialMock).toHaveBeenCalledTimes(1)
      expect(screen.getByText('รับเอกสารสำเร็จ')).toBeTruthy()
    })
  })

  it('keeps pending mDOC through issuer confirmation and waits for dual-format finalization', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fdual-format-offer'
    readStoredCredentialsMock.mockReturnValue([
      {
        id: 'active-id-card',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ])
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [
        {
          id: 'DrivingCredential_dc+sd-jwt',
          format: 'dc+sd-jwt',
          rawConfiguration: { logical_credential_id: 'driving-1' },
        },
        {
          id: 'DrivingCredential_mso_mdoc',
          format: 'mso_mdoc',
          rawConfiguration: {
            doctype: 'org.iso.18013.5.1.mDL',
            logical_credential_id: 'driving-1',
          },
        },
      ],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })
    const record = {
      id: 'dual-driving-licence',
      type: 'DLTDrivingLicence',
      rawVc: 'sd-jwt',
      claims: {},
      issuedAt: '2026-06-09T00:00:00.000Z',
      issuerUrl: 'https://issuer.example',
      credentialConfigurationId: 'DrivingCredential_dc+sd-jwt',
    }
    const pendingMdoc = {
      docType: 'org.iso.18013.5.1.mDL',
      configurationId: 'DrivingCredential_mso_mdoc',
      sdJwtConfigurationId: 'DrivingCredential_dc+sd-jwt',
      logicalCredentialId: 'driving-1',
      issuer: 'https://issuer.example',
      rawBase64: 'AQIDBA',
    }
    acquireDualFormatForPreviewMock.mockResolvedValue({ primaryRecord: record, pendingMdoc })
    let releaseFinalize: (() => void) | undefined
    finalizeDualFormatCredentialMock.mockImplementation(
      () => new Promise<void>((resolve) => {
        releaseFinalize = resolve
      }),
    )

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('thai-id-confirmation-image')).toBeTruthy()
    })
    expect(acquireDualFormatForPreviewMock).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('ยืนยัน'))

    await waitFor(() => {
      expect(acquireDualFormatForPreviewMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('driving-licence-preview-panel')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('ยอมรับ'))

    await waitFor(() => {
      expect(screen.getByTestId('issuer-confirmation-image')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('ยืนยัน'))

    await waitFor(() => {
      expect(finalizeDualFormatCredentialMock).toHaveBeenCalledWith(record, pendingMdoc, {
        refreshCredentials: expect.any(Function),
      })
    })
    expect(screen.queryByText('รับเอกสารสำเร็จ')).toBeNull()
    expect(saveScannedCredentialMock).not.toHaveBeenCalled()

    await act(async () => {
      releaseFinalize?.()
    })

    await waitFor(() => {
      expect(screen.getByText('รับเอกสารสำเร็จ')).toBeTruthy()
    })
  })

  it('shows the university issuer confirmation after transcript preview', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Ftranscript-confirmation'
    readStoredCredentialsMock.mockReturnValue([
      {
        id: 'active-id-card',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ])
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ChulalongkornUniversityTranscript', format: 'dc+sd-jwt', rawConfiguration: {} }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })
    acquireCredentialRecordMock.mockResolvedValue({
      id: 'transcript-confirmation',
      type: 'ChulalongkornUniversityTranscript',
      rawVc: 'vc',
      claims: {},
      issuedAt: '2026-06-09T00:00:00.000Z',
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('thai-id-confirmation-image')).toBeTruthy()
    })
    expect(acquireCredentialRecordMock).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('ยืนยัน'))

    await waitFor(() => {
      expect(acquireCredentialRecordMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('document-card-layout')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('ยอมรับ'))

    await waitFor(() => {
      expect(screen.getByTestId('issuer-confirmation-image')).toBeTruthy()
    })
    expect(screen.getByText('จุฬาลงกรณ์มหาวิทยาลัย')).toBeTruthy()
    expect(screen.getByText(/ใบแสดงผลการเรียน/)).toBeTruthy()
  })

  it('shows the DOPA confirmation before acquiring an unsupported credential preview', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fmedical-offer'
    readStoredCredentialsMock.mockReturnValue([
      {
        id: 'active-id-card',
        type: 'ThaiNationalID',
        rawVc: 'vc',
        claims: {},
        issuedAt: '2026-06-09T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
    ])
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'MedicalCertificate', format: 'dc+sd-jwt', rawConfiguration: {} }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })
    acquireCredentialRecordMock.mockResolvedValue({
      id: 'medical-certificate',
      type: 'MedicalCertificate',
      rawVc: 'vc',
      claims: {},
      issuedAt: '2026-06-09T00:00:00.000Z',
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(screen.getByTestId('thai-id-confirmation-image')).toBeTruthy()
    })
    expect(acquireCredentialRecordMock).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('ยืนยัน'))

    await waitFor(() => {
      expect(acquireCredentialRecordMock).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('credential-preview-content')).toBeTruthy()
    })

    fireEvent.press(screen.getByText('ยอมรับ'))

    await waitFor(() => {
      expect(saveScannedCredentialMock).toHaveBeenCalledTimes(1)
      expect(screen.getByText('รับเอกสารสำเร็จ')).toBeTruthy()
    })
    expect(screen.queryByTestId('issuer-confirmation-image')).toBeNull()
  })

  it('dismisses the active deeplink before navigating back to wallet', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useUrlMock.mockReturnValue(offerUri)
    resolveOfferMock.mockRejectedValue(new Error('Issuer offline'))

    render(<CredentialOfferClaimScreen />)

    await screen.findByText('Back to Wallet')
    fireEvent.press(screen.getByText('Back to Wallet'))

    expect(useDeeplinkStore.getState().dismissedUri).toBe(offerUri)
    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)')
  })

  it('reopens a fresh offer after the user dismisses the claim screen and requests again', async () => {
    const firstOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer-1'
    const secondOfferUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer-2'
    useDeeplinkStore.getState().setPendingDeeplinkUri(firstOfferUri)
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    render(<CredentialOfferClaimScreen />)

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(firstOfferUri)
    })

    resolveOfferMock.mockClear()
    await act(async () => {
      useDeeplinkStore.getState().setDismissedDeeplinkUri(firstOfferUri)
      useDeeplinkStore.getState().setIncomingDeeplinkUri(secondOfferUri)
    })

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(secondOfferUri)
    })
  })

  it('reopens the same offer after back navigation clears the started-offer guard', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useDeeplinkStore.getState().setPendingDeeplinkUri(offerUri)
    resolveOfferMock.mockRejectedValue(new Error('Issuer offline'))

    render(<CredentialOfferClaimScreen />)

    await screen.findByText('Back to Wallet')
    fireEvent.press(screen.getByText('Back to Wallet'))

    resolveOfferMock.mockClear()
    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    await act(async () => {
      useDeeplinkStore.getState().clearDismissedDeeplinkUri()
      useDeeplinkStore.getState().setIncomingDeeplinkUri(offerUri)
    })

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalledWith(offerUri)
    })
  })

  it('waits for a pending offer before showing the missing-offer error', async () => {
    jest.useFakeTimers()
    linkingMock.getInitialURL.mockResolvedValue(null)

    render(<CredentialOfferClaimScreen />)

    await act(async () => {
      useDeeplinkStore.getState().setIncomingDeeplinkUri(
        'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer',
      )
    })

    resolveOfferMock.mockResolvedValue({
      credentialConfigurations: [{ id: 'ThaiNationalID' }],
      issuer: 'https://issuer.example',
      txCode: undefined,
    })

    await act(async () => {
      jest.advanceTimersByTime(2000)
    })

    expect(screen.queryByText('No credential offer link is pending.')).toBeNull()

    await waitFor(() => {
      expect(resolveOfferMock).toHaveBeenCalled()
    })

    jest.useRealTimers()
  })

  it('returns to the tab shell when no navigation history exists', async () => {
    const offerUri = 'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Foffer'
    useUrlMock.mockReturnValue(offerUri)
    resolveOfferMock.mockRejectedValue(new Error('Issuer offline'))

    render(<CredentialOfferClaimScreen />)

    await screen.findByText('Back to Wallet')
    fireEvent.press(screen.getByText('Back to Wallet'))

    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)')
  })
})
