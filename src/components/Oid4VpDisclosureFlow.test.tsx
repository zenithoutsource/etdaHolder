import { act, fireEvent, render, screen } from '@testing-library/react-native'

import { Oid4VpDisclosureFlow } from './Oid4VpDisclosureFlow'
import { logWalletError } from '../services/debug/walletLogger'
import { useSameDeviceIssuanceStore } from '../store/sameDeviceIssuanceStore'
import type { VerifiableCredentialRecord } from '../services/vci/exchangeService'

jest.mock('../services/debug/walletLogger', () => ({
  logWalletStep: jest.fn(),
  logWalletError: jest.fn(),
}))

jest.mock('../config/trustedVerifiers', () => ({
  TRUSTED_VERIFIERS: [],
  isIssuerOid4VpClientId: () => false,
  isIssuerOid4VpResponseUri: () => false,
}))

jest.mock('../config/cardSchemas', () => jest.requireActual('../config/cardSchemas'))

jest.mock('../services/credentials/credentialLifecycle', () => ({
  filterPresentableCredentials: (records: { id?: string }[]) =>
    records.filter((record) => !String(record.id ?? '').startsWith('legacy-')),
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

const mockMarkPresentationRequestConsumed = jest.fn()
jest.mock('../services/vp/presentationRequestReplay', () => ({
  markPresentationRequestConsumed: (...args: unknown[]) => mockMarkPresentationRequestConsumed(...args),
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
  const actual = jest.requireActual('./PresentationConsentPanel')
  const { Pressable, Text } = require('react-native')
  return {
    ...actual,
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
  }
})

jest.mock('./PresentationInfoPanel', () => {
  const { Pressable, Text } = require('react-native')
  return {
    PresentationInfoPanel: ({
      onConfirm,
      onToggleClaim,
    }: {
      onConfirm: () => void
      onToggleClaim: (claimKey: string) => void
    }) => (
      <>
        <Pressable onPress={() => onToggleClaim('gpa')}>
          <Text>toggle-gpa-off</Text>
        </Pressable>
        <Pressable onPress={onConfirm}>
          <Text>info-confirm</Text>
        </Pressable>
      </>
    ),
  }
})

jest.mock('./PresentationResultPanel', () => {
  const { Text } = require('react-native')
  return {
    PresentationResultPanel: ({ verifierName }: { verifierName: string }) => <Text>success-{verifierName}</Text>,
  }
})

jest.mock('./IssuerPidPresentationPanel', () => {
  const { Pressable, Text } = require('react-native')
  return {
    IssuerPidPresentationPanel: ({
      onConfirm,
      onDecline,
      submitting,
    }: {
      onConfirm: () => void
      onDecline: () => void
      submitting?: boolean
    }) => (
      <>
        <Pressable onPress={onConfirm} disabled={submitting}>
          <Text>issuer-pid-confirm</Text>
        </Pressable>
        <Pressable onPress={onDecline}>
          <Text>issuer-pid-decline</Text>
        </Pressable>
      </>
    ),
  }
})

const credential = { id: 'cred-1', type: 'ThaiNationalID', rawVc: 'a~b~', claims: {} } as unknown as VerifiableCredentialRecord

function buildRequest() {
  return {
    requestUri: 'openid4vp://authorize?request_uri=http://verifier/r/1',
    nonce: 'nonce-123',
    protocolPath: 'legacy' as const,
    matchedCredential: credential,
    verifier: { name: 'ผู้ตรวจสอบทดสอบ' },
    disclosures: [
      { key: 'name', label: 'ชื่อ', value: 'Test', mandatory: false, selective: true },
      { key: 'national_id', label: 'เลขบัตร', value: '1', mandatory: true, selective: false },
    ],
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
  mockMarkPresentationRequestConsumed.mockReset()
  mockReadMode.mockReturnValue('sd-jwt-kb')
  mockCreateResponse.mockResolvedValue({ vpToken: 'vp~kb', presentationSubmission: { id: 'sub' } })
  mockSubmit.mockResolvedValue({ status: 'accepted' })
  useSameDeviceIssuanceStore.getState().clearSession()
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
      expect.objectContaining({
        trustedVerifiers: [],
        presentationFlowOrigin: 'my-qr',
      }),
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
    expect(mockMarkPresentationRequestConsumed).toHaveBeenCalledWith({
      requestUri: 'openid4vp://authorize?request_uri=http://verifier/r/1',
      nonce: 'nonce-123',
    })
    expect(mockSubmit.mock.invocationCallOrder[0])
      .toBeLessThan(mockMarkPresentationRequestConsumed.mock.invocationCallOrder[0]!)
    expect(mockRecordSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'wallet', partyName: 'ผู้ตรวจสอบทดสอบ', credentialId: 'cred-1' }),
    )
    expect(screen.getByText('success-ผู้ตรวจสอบทดสอบ')).toBeTruthy()
  })

  test('issuer PID VP skips Face Prepare and submits from the PID card confirm', async () => {
    mockResolve.mockResolvedValue(buildRequest())
    useSameDeviceIssuanceStore.getState().setSession({
      id: 'session-1',
      credentialType: 'DLTDrivingLicence',
      phase: 'awaiting_pid_vp',
      codeVerifier: 'verifier',
      redirectUri: 'walletapp://callback',
    })

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://issuer/r/1"
        credentials={[credential]}
        historyChannel="oid4vp"
        logScope="presentation-request"
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    expect(screen.queryByText('scan-face')).toBeNull()
    expect(screen.queryByText('consent-accept')).toBeNull()
    expect(screen.getByText('issuer-pid-confirm')).toBeTruthy()

    fireEvent.press(screen.getByText('issuer-pid-confirm'))
    await flush()
    expect(mockCreateResponse).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('info-confirm')).toBeNull()
    expect(screen.getByText('success-ผู้ตรวจสอบทดสอบ')).toBeTruthy()
  })

  test('issuer PID VP decline cancels without submitting', async () => {
    mockResolve.mockResolvedValue(buildRequest())
    useSameDeviceIssuanceStore.getState().setSession({
      id: 'session-1',
      credentialType: 'DLTDrivingLicence',
      phase: 'awaiting_pid_vp',
      codeVerifier: 'verifier',
      redirectUri: 'walletapp://callback',
    })
    const onCancel = jest.fn()

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://issuer/r/1"
        credentials={[credential]}
        historyChannel="oid4vp"
        logScope="presentation-request"
        onDone={jest.fn()}
        onCancel={onCancel}
      />,
    )

    await flush()
    fireEvent.press(screen.getByText('issuer-pid-decline'))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  test('shows issuer-pid missing when the Issuer PID VP cannot match ThaiNationalID', async () => {
    mockResolve.mockRejectedValue(new Error('PresentationCredentialMissing:issuer-pid: no ThaiNationalID'))

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://issuer/r/1"
        credentials={[]}
        historyChannel="oid4vp"
        logScope="presentation-request"
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    expect(screen.getByText('ยังไม่มีบัตรประชาชนใน Wallet')).toBeTruthy()
  })

  test('keeps the success panel when presentable credentials change after submit', async () => {
    mockResolve.mockResolvedValue(buildRequest())
    const secondCredential = {
      id: 'cred-2',
      type: 'DLTDrivingLicence',
      rawVc: 'c~d~',
      claims: {},
    } as unknown as VerifiableCredentialRecord

    const { rerender } = render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential]}
        historyChannel="oid4vp"
        logScope="presentation-request"
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    fireEvent.press(screen.getByText('scan-face'))
    await flush()
    fireEvent.press(screen.getByText('consent-accept'))
    await flush()
    fireEvent.press(screen.getByText('info-confirm'))
    await flush()
    expect(screen.getByText('success-ผู้ตรวจสอบทดสอบ')).toBeTruthy()
    expect(mockResolve).toHaveBeenCalledTimes(1)

    rerender(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential, secondCredential]}
        historyChannel="oid4vp"
        logScope="presentation-request"
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )
    await flush()

    expect(screen.getByText('success-ผู้ตรวจสอบทดสอบ')).toBeTruthy()
    expect(screen.queryByText('กำลังเปิดการสำแดง…')).toBeNull()
    expect(mockResolve).toHaveBeenCalledTimes(1)
  })

  test('reports a replay-ledger failure after the presentation has been submitted', async () => {
    mockResolve.mockResolvedValue(buildRequest())
    mockMarkPresentationRequestConsumed.mockImplementation(() => {
      throw new Error('PresentationReplayLedgerWriteFailed')
    })

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
    fireEvent.press(screen.getByText('info-confirm'))
    await flush()

    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockMarkPresentationRequestConsumed).toHaveBeenCalledTimes(1)
    expect(screen.getByText('ไม่สามารถบันทึกสถานะความปลอดภัยได้')).toBeTruthy()
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
      expect.objectContaining({
        kind: 'presentation-declined',
        channel: 'wallet',
        disclosedClaims: [],
      }),
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
    expect(screen.getByText('ผู้ตรวจสอบไม่ได้รับความเชื่อถือ')).toBeTruthy()
  })

  test('does not pass hardware-reissue credentials into presentation resolve', async () => {
    mockResolve.mockRejectedValue(new Error('PresentationCredentialMissing'))
    const legacyCredential = { ...credential, id: 'legacy-ed25519' }

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[legacyCredential]}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    expect(mockResolve).toHaveBeenCalledWith(
      'openid4vp://authorize?request_uri=http://verifier/r/1',
      [],
      expect.any(Object),
    )
  })

  test('shows a friendly document-unavailable state without exposing the requested vct URL', async () => {
    const onRequestCredential = jest.fn()
    mockResolve.mockRejectedValue(Object.assign(
      new Error(
        'PresentationCredentialMetadataMismatch: requested vct_values [https://issuer.example/credentials/TranscriptCredential]; stored vct [https://issuer.example/credentials/IDCard]',
      ),
      {
        name: 'PresentationCredentialUnavailableError',
        reason: 'metadata-mismatch',
        requestedVctValues: ['https://issuer.example/credentials/TranscriptCredential'],
        requestedCredentialTypes: [],
      },
    ))

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential]}
        presentationOrigin="scanned-verifier-qr"
        onRequestCredential={onRequestCredential}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    expect(screen.getByTestId('presentation-failure-panel')).toBeTruthy()
    expect(screen.getByText('ใบแสดงผลการเรียน')).toBeTruthy()
    expect(screen.getByText('เอกสารไม่ตรงกับที่ผู้ตรวจสอบขอ')).toBeTruthy()
    expect(screen.queryByText(/https:\/\/issuer\.example/)).toBeNull()

    fireEvent.press(screen.getByTestId('presentation-failure-request'))
    expect(onRequestCredential).toHaveBeenCalledWith('ChulalongkornUniversityTranscript')
  })

  test('shows only the My QR return action for an unknown requested document', async () => {
    mockResolve.mockRejectedValue(Object.assign(
      new Error('PresentationCredentialMissing'),
      {
        name: 'PresentationCredentialUnavailableError',
        reason: 'credential-missing',
        requestedVctValues: ['urn:example:unsupported-document'],
        requestedCredentialTypes: [],
      },
    ))

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential]}
        presentationOrigin="wallet-generated-qr"
        onRequestCredential={jest.fn()}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    expect(screen.getByText('เอกสารที่ร้องขอ')).toBeTruthy()
    expect(screen.queryByTestId('presentation-failure-request')).toBeNull()
    expect(screen.getByText('กลับไปที่ My QR')).toBeTruthy()
  })

  test('shows missing-claim guidance when the stored credential is incomplete for the verifier request', async () => {
    mockResolve.mockRejectedValue(Object.assign(
      new Error(
        'PresentationCredentialMissing: requested credential is not available (ThaiNationalID(sd-jwt) failed claims gate [missing claims: photo])',
      ),
      {
        name: 'PresentationCredentialUnavailableError',
        reason: 'credential-missing',
        requestedVctValues: ['https://issuer.example/credentials/IDCard'],
        requestedCredentialTypes: ['ThaiNationalID'],
        matchFailureKind: 'claims-incomplete',
        unsatisfiedClaimKeys: ['photo'],
        recordType: 'ThaiNationalID',
      },
    ))

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[credential]}
        presentationOrigin="wallet-generated-qr"
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    expect(screen.getByText('เอกสารไม่ครบข้อมูลที่ผู้ตรวจสอบต้องการ')).toBeTruthy()
    expect(screen.getByText(/รูปถ่าย/)).toBeTruthy()
    expect(screen.queryByText('ไม่พบเอกสารที่ใช้ยืนยัน')).toBeNull()
    expect(screen.queryByTestId('presentation-failure-request')).toBeNull()
  })

  test('does not resolve again when a refreshed credentials array contains the same records', async () => {
    mockResolve.mockRejectedValue(new Error('VerifierUntrusted'))
    const props = {
      authorizationRequestUri: 'openid4vp://authorize?request_uri=http://verifier/r/1',
      onDone: jest.fn(),
      onCancel: jest.fn(),
    }
    const { rerender } = render(
      <Oid4VpDisclosureFlow
        {...props}
        credentials={[credential]}
      />,
    )

    await flush()
    rerender(
      <Oid4VpDisclosureFlow
        {...props}
        credentials={[credential]}
      />,
    )
    await flush()

    expect(mockResolve).toHaveBeenCalledTimes(1)
  })

  test('does not log a stale resolver failure after credentials change', async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined
    mockResolve
      .mockImplementationOnce(() => new Promise((_resolve, reject) => {
        rejectFirst = reject
      }))
      .mockRejectedValueOnce(new Error('VerifierUntrusted'))

    const props = {
      authorizationRequestUri: 'openid4vp://authorize?request_uri=http://verifier/r/1',
      onDone: jest.fn(),
      onCancel: jest.fn(),
    }
    const { rerender } = render(
      <Oid4VpDisclosureFlow
        {...props}
        credentials={[credential]}
      />,
    )
    const replacementCredential = {
      ...credential,
      id: 'cred-2',
    } as VerifiableCredentialRecord
    rerender(
      <Oid4VpDisclosureFlow
        {...props}
        credentials={[replacementCredential]}
      />,
    )
    await flush()

    await act(async () => {
      rejectFirst?.(new Error('stale failure'))
      await Promise.resolve()
    })

    expect(logWalletError).toHaveBeenCalledTimes(1)
    expect(logWalletError).toHaveBeenCalledWith(
      'my-qr',
      'presentation-resolve-failed',
      expect.objectContaining({ message: 'VerifierUntrusted' }),
    )
  })

  test('records only effective disclosed claims when holder deselects optional GPA', async () => {
    const transcriptCredential = {
      id: 'transcript-1',
      type: 'ChulalongkornUniversityTranscript',
      rawVc: 'issuer.jwt~',
      claims: {},
      issuedAt: '2026-01-01T00:00:00.000Z',
    } as unknown as VerifiableCredentialRecord

    mockResolve.mockResolvedValue({
      matchedCredential: transcriptCredential,
      verifier: { name: 'Verifier' },
      disclosures: [
        { key: 'student_id', label: 'รหัสนักศึกษา', value: '6512345678', mandatory: true, selective: false },
        { key: 'gpa', label: 'เกรดเฉลี่ย', value: '3.75', mandatory: false, selective: true },
      ],
    })

    render(
      <Oid4VpDisclosureFlow
        authorizationRequestUri="openid4vp://authorize?request_uri=http://verifier/r/1"
        credentials={[transcriptCredential]}
        onDone={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    await flush()
    fireEvent.press(screen.getByText('scan-face'))
    await flush()
    fireEvent.press(screen.getByText('consent-accept'))
    await flush()
    fireEvent.press(screen.getByText('toggle-gpa-off'))
    fireEvent.press(screen.getByText('info-confirm'))
    await flush()

    expect(mockRecordSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        disclosedClaims: ['รหัสนักศึกษา'],
      }),
    )
    expect(mockRecordSuccess.mock.calls[0]?.[0]?.disclosedClaims).not.toContain('เกรดเฉลี่ย')
  })
})
