import { resolvePresentationFailureUi } from './presentationFailureUi'
import { PresentationCredentialUnavailableError } from './presentationUnavailable'

describe('resolvePresentationFailureUi', () => {
  test('maps missing claims to a Thai claims-incomplete screen with disclosure labels', () => {
    const error = new PresentationCredentialUnavailableError({
      message:
        'PresentationCredentialMissing: requested credential is not available (ThaiNationalID(sd-jwt) failed claims gate [missing claims: photo])',
      reason: 'credential-missing',
      requestedVctValues: ['https://issuer.example/credentials/IDCard'],
      requestedCredentialTypes: ['ThaiNationalID'],
      matchFailureKind: 'claims-incomplete',
      unsatisfiedClaimKeys: ['photo'],
      recordType: 'ThaiNationalID',
    })

    expect(resolvePresentationFailureUi(error)).toEqual(
      expect.objectContaining({
        kind: 'claims-incomplete',
        title: 'เอกสารไม่ครบข้อมูลที่ผู้ตรวจสอบต้องการ',
        documentLabel: 'Thai National ID',
        missingClaimLabels: ['รูปถ่าย'],
        showRequestButton: false,
        requestCredentialType: 'ThaiNationalID',
      }),
    )
  })

  test('maps document-not-stored when no credential exists in wallet', () => {
    const error = new PresentationCredentialUnavailableError({
      message: 'PresentationCredentialMissing: requested credential is not available (no matching rule applied)',
      reason: 'credential-missing',
      requestedVctValues: ['https://issuer.example/credentials/TranscriptCredential'],
      requestedCredentialTypes: ['ChulalongkornUniversityTranscript'],
      matchFailureKind: 'document-not-stored',
    })

    expect(resolvePresentationFailureUi(error)).toEqual(
      expect.objectContaining({
        kind: 'document-not-stored',
        title: 'ไม่พบเอกสารที่ใช้ยืนยัน',
        documentLabel: 'Academic Transcript',
        showRequestButton: true,
        requestCredentialType: 'ChulalongkornUniversityTranscript',
      }),
    )
  })

  test('maps metadata mismatch separately from missing document', () => {
    const error = new PresentationCredentialUnavailableError({
      message: 'PresentationCredentialMetadataMismatch: stored ThaiNationalID vct mismatch',
      reason: 'metadata-mismatch',
      requestedVctValues: ['https://issuer.example/credentials/TranscriptCredential'],
      requestedCredentialTypes: [],
      matchFailureKind: 'metadata-mismatch',
    })

    expect(resolvePresentationFailureUi(error)).toEqual(
      expect.objectContaining({
        kind: 'metadata-mismatch',
        title: 'เอกสารไม่ตรงกับที่ผู้ตรวจสอบขอ',
        documentLabel: 'Academic Transcript',
      }),
    )
  })

  test('maps verifier untrusted technical errors', () => {
    expect(resolvePresentationFailureUi(new Error('VerifierUntrusted: origin mismatch'))).toEqual(
      expect.objectContaining({
        kind: 'verifier-untrusted',
        title: 'ผู้ตรวจสอบไม่ได้รับความเชื่อถือ',
      }),
    )
  })

  test('maps submission rejection to a clean Thai message without raw diagnostics', () => {
    const ui = resolvePresentationFailureUi(
      new Error(
        'PresentationSubmissionFailed: HTTP 400: invalid_request. Presentation debug: kb_header_alg=ES256',
      ),
    )

    expect(ui).toEqual(
      expect.objectContaining({
        kind: 'submission-rejected',
        title: 'ผู้ตรวจสอบปฏิเสธการส่งข้อมูล',
        body: 'คำขอส่งข้อมูลไม่ผ่านการตรวจสอบของผู้ตรวจสอบ',
      }),
    )
    expect(ui.body).not.toContain('Presentation debug')
    expect(ui.body).not.toContain('invalid_request')
    expect(ui.body).not.toContain('ES256')
  })

  test('maps format mismatch technical errors', () => {
    expect(
      resolvePresentationFailureUi(
        new Error('PresentationCredentialFormatUnsupported: stored credential format does not match the Verifier request'),
      ),
    ).toEqual(
      expect.objectContaining({
        kind: 'format-mismatch',
        title: 'รูปแบบเอกสารไม่ตรงกัน',
      }),
    )
  })

  test('maps PresentationRequestFetchFailed HTTP 404 to an expired-request screen without raw status text', () => {
    const ui = resolvePresentationFailureUi(
      new Error('PresentationRequestFetchFailed: HTTP 404'),
    )

    expect(ui).toEqual(
      expect.objectContaining({
        kind: 'request-expired',
        title: 'คำขอตรวจสอบหมดอายุแล้ว',
        body: 'ลิงก์หรือ QR จากผู้ตรวจสอบใช้ไม่ได้แล้ว หรือถูกยกเลิกไปแล้ว',
        hint: 'ขอ QR หรือลิงก์ใหม่จากผู้ตรวจสอบ แล้วลองอีกครั้ง',
        showRequestButton: false,
      }),
    )
    expect(ui.body).not.toContain('404')
    expect(ui.body).not.toContain('PresentationRequestFetchFailed')
  })

  test('maps PresentationRequestFetchFailed network errors to an unreachable screen', () => {
    expect(
      resolvePresentationFailureUi(
        new Error('PresentationRequestFetchFailed: Network request failed'),
      ),
    ).toEqual(
      expect.objectContaining({
        kind: 'request-unreachable',
        title: 'เชื่อมต่อผู้ตรวจสอบไม่สำเร็จ',
        showRequestButton: false,
      }),
    )
  })

  test('maps hardware cutover signing blocks to a reissue screen', () => {
    expect(resolvePresentationFailureUi(new Error('LegacyHolderSigningUnsupported'))).toEqual(
      expect.objectContaining({
        kind: 'not-presentable',
        body: 'เอกสารนี้ยังผูกกับกุญแจเก่า กรุณาขอเอกสารใหม่จากผู้ออกเอกสาร',
        showRequestButton: false,
      }),
    )
    expect(
      resolvePresentationFailureUi(new Error('ProximityHardwareDeviceAuthUnavailable')),
    ).toEqual(
      expect.objectContaining({
        kind: 'not-presentable',
        showRequestButton: false,
      }),
    )
  })
})
