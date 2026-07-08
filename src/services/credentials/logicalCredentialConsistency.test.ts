import { validateCrossFormatConsistency } from './logicalCredentialConsistency'

test('flags issued-at skew beyond configured threshold as warning', () => {
  const result = validateCrossFormatConsistency({
    issuer: 'https://issuer.example.com',
    documentType: 'BangkokUniversityTranscript',
    sdJwt: {
      format: 'dc+sd-jwt',
      credentialConfigurationId: 'TranscriptCredential_dc+sd-jwt',
      rawCredentialRef: 'vc-1',
      issuedAt: '2026-01-01T00:00:00.000Z',
      holderBindingRef: 'etda_wallet_signing_key',
    },
    mdoc: {
      format: 'mso_mdoc',
      credentialConfigurationId: 'TranscriptCredential_mso_mdoc',
      rawCredentialRef: 'vc-1',
      issuedAt: '2026-01-01T01:00:00.000Z',
      holderBindingRef: 'etda_wallet_signing_key',
    },
  })

  expect(result.consistencyStatus).toBe('warning')
  expect(result.warnings.length).toBeGreaterThan(0)
})
