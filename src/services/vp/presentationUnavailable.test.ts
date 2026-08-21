import {
  PresentationCredentialUnavailableError,
  readPresentationUnavailableDetails,
} from './presentationUnavailable'

describe('presentationUnavailable', () => {
  test('maps a transcript vct to the supported document label and portal type', () => {
    const error = new PresentationCredentialUnavailableError({
      message: 'PresentationCredentialMetadataMismatch',
      reason: 'metadata-mismatch',
      requestedVctValues: ['https://issuer.example/credentials/TranscriptCredential'],
    })

    expect(readPresentationUnavailableDetails(error)).toEqual({
      reason: 'metadata-mismatch',
      documentLabel: 'ใบแสดงผลการเรียน',
      requestCredentialType: 'ChulalongkornUniversityTranscript',
    })
  })

  test('keeps unknown requested types generic and unavailable for portal routing', () => {
    const error = new PresentationCredentialUnavailableError({
      message: 'PresentationCredentialMissing',
      reason: 'credential-missing',
      requestedVctValues: ['urn:example:unsupported-document'],
    })

    expect(readPresentationUnavailableDetails(error)).toEqual({
      reason: 'credential-missing',
      documentLabel: 'เอกสารที่ร้องขอ',
    })
  })

  test('does not classify unrelated technical errors as document unavailability', () => {
    expect(readPresentationUnavailableDetails(new Error('VerifierUntrusted'))).toBeUndefined()
  })
})
