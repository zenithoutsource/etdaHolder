import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { Oid4VpDisclosureFlow } from './Oid4VpDisclosureFlow'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

jest.mock('../services/debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

jest.mock('../config/trustedVerifiers', () => ({ TRUSTED_VERIFIERS: [] }))

jest.mock('../config/cardSchemas', () => ({
  getCardSchema: () => ({ title: 'บัตรประชาชน' }),
}))

jest.mock('../services/credentials/credentialLifecycle', () => ({
  filterPresentableCredentials: (records: unknown[]) => records,
}))

jest.mock('../services/scan/scanFriendlyErrors', () => ({
  toFriendlyError: (raw: string) => raw,
}))

jest.mock('../services/scan/scanLogDescriptors', () => ({
  describePresentationForLog: () => ({}),
}))

const mockResolve = jest.fn()
const mockSubmit = jest.fn()
const mockReadMode = jest.fn()
jest.mock('../services/vp/presentationService', () => ({
  resolvePresentationRequest: (...args: unknown[]) => mockResolve(...args),
  submitPresentationResponse: (...args: unknown[]) => mockSubmit(...args),
  readPresentationTokenMode: (...args: unknown[]) => mockReadMode(...args),
}))

const mockCreateResponse = jest.fn()
const mockBiometric = jest.fn()
jest.mock('../services/vp/presentationApproval', () => ({
  createApprovedPresentationResponse: (...args: unknown[]) => mockCreateResponse(...args),
  confirmPresentationBiometric: (...args: unknown[]) => mockBiometric(...args),
}))

const mockRecordSuccess = jest.fn()
jest.mock('../services/history/recordWalletPresentationSuccess', () => ({
  recordWalletPresentationSuccess: (...args: unknown[]) => mockRecordSuccess(...args),
}))

const mockRecordFailure = jest.fn()
jest.mock('../services/history/walletHistoryRecording', () => ({
  recordWalletInitiatedPresentationFailure: (...args: unknown[]) => mockRecordFailure(...args),
}))

const mockAppendHistory = jest.fn()
jest.mock('../services/history/walletEventLog', () => ({
  appendWalletHistoryEvent: (...args: unknown[]) => mockAppendHistory(...args),
}))

const mockConsume = jest.fn()
jest.mock('../services/credentials/singleUseCredentialConsumption', () => ({
  maybeConsumeSingleUseCredential: (...args: unknown[]) => mockConsume(...args),
}))

jest.mock('./PresentationStepScaffold', () => {
  const { View } = require('react-native')
  return { PresentationStepScaffold: ({ children }: { children: React.ReactNode }) => <View>{children}</View> }
})

jest.mock('./FacePreparePanel', () => {
  const { Pressable, Text } = require('react-native')
  return {
    FacePreparePanel: ({ onScan }: { onScan: () => void }) => (
      <Pressable onPress={onScan}>
        <Text>scan-face</Text>
      </Pressable>
    ),
  }
})

jest.mock('./PresentationConsentPanel', () => {
  const { Pressable, Text } = require('react-native')
  return {
    PresentationConsentPanel: ({ onAccept, onReject }: { onAccept: () => void; onReject: () => void }) => (
      <>
        <Pressable onPress={onAccept}>
          <Text>consent-accept</Text>
        </Pressable>
        <Pressable onPress={onReject}>
          <Text>consent-reject</Text>
        </Pressable>
      </>
    ),
    readInitialSelectedClaimKeys: () => new Set(['credential']),
    readSelectedDisclosureLabels: () => ['ชื่อ'],
  }
})

jest.mock('./PresentationInfoPanel', () => {
  const { Pressable, Text } = require('react-native')
  return {
    PresentationInfoPanel: ({ onConfirm }: { onConfirm: () => void }) => (
      <Pressable onPress={onConfirm}>
        <Text>info-confirm</Text>
      </Pressable>
    ),
  }
})

jest.mock('./PresentationResultPanel', () => {
  const { Text } = require('react-native')
  return {
    PresentationResultPanel: ({ verifierName }: { verifierName: string }) => <Text>success-{verifierName}</Text>,
  }
})

const credential = { id: 'cred-1', type: 'ThaiNationalID', rawVc: 'a~b~', claims: {} } as unknown as VerifiableCredentialRecord

function buildRequest() {
  return {
    matchedCredential: credential,
    verifier: { name: 'ผู้ตรวจสอบทดสอบ' },
    disclosures: [{ label: 'ชื่อ' }, { label: 'เลขบัตร' }],
    presentationDefinition: {},
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReadMode.mockReturnValue('sd-jwt-kb')
  mockCreateResponse.mockResolvedValue({ vpToken: 'vp~kb', presentationSubmission: { id: 'sub' } })
  mockSubmit.mockResolvedValue({ status: 'accepted' })
})

describe('Oid4VpDisclosureFlow', () => {
  test('runs resolve → consent → info accept → submit → success on the wallet channel', async () => {
    mockResolve.mockResolvedValue(buildRequest())

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential]}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    expect(mockResolve).toHaveBeenCalledWith(
      'openid4vp://authorize?request_uri=http://verifier/r/1',
      [credential],
      expect.objectContaining({ trustedVerifiers: [] }),
    )
    expect(screen.getByText('scan-face')).toBeTruthy()

    fireEvent.press(screen.getByText('scan-face'))
    await flush()
    expect(mockBiometric).not.toHaveBeenCalled()
    expect(screen.getByText('consent-accept')).toBeTruthy()

    fireEvent.press(screen.getByText('consent-accept'))
    await flush()
    expect(mockCreateResponse).not.toHaveBeenCalled()
    expect(screen.getByText('info-confirm')).toBeTruthy()

    fireEvent.press(screen.getByText('info-confirm'))
    await flush()
    expect(mockCreateResponse).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockRecordSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'wallet', partyName: 'ผู้ตรวจสอบทดสอบ', credentialId: 'cred-1' }),
    )
    expect(screen.getByText('success-ผู้ตรวจสอบทดสอบ')).toBeTruthy()
  })

  test('raw-credential mode requires the app-level biometric gate at info accept', async () => {
    mockResolve.mockResolvedValue(buildRequest())
    mockReadMode.mockReturnValue('raw-credential')
    mockBiometric.mockResolvedValue(undefined)

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential]}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    fireEvent.press(screen.getByText('scan-face'))
    await flush()
    fireEvent.press(screen.getByText('consent-accept'))
    await flush()
    expect(mockBiometric).not.toHaveBeenCalled()

    fireEvent.press(screen.getByText('info-confirm'))
    await flush()
    expect(mockBiometric).toHaveBeenCalledTimes(1)
  })

  test('records a wallet-channel decline and cancels when the user rejects', async () => {
    mockResolve.mockResolvedValue(buildRequest())
    const onCancel = jest.fn()

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential]}
        onDone={jest.fn()}
        onCancel={onCancel}
      />,
    )

    await flush()
    fireEvent.press(screen.getByText('scan-face'))
    await flush()
    fireEvent.press(screen.getByText('consent-reject'))

    expect(mockAppendHistory).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'presentation-declined', channel: 'wallet' }),
    )
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  test('shows an error when resolving the request fails', async () => {
    mockResolve.mockRejectedValue(new Error('VerifierUntrusted'))

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential]}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    expect(screen.getByText('VerifierUntrusted')).toBeTruthy()
  })
})
