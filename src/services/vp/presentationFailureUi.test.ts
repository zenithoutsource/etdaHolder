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
})
