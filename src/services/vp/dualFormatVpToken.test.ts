import { buildDualFormatDcqlVpToken } from './dualFormatVpToken'
import type { ResolvedPresentationRequest } from './presentationService'

const baseRequest: ResolvedPresentationRequest = {
  requestUri: 'openid4vp://authorize',
  clientId: 'redirect_uri:https://verifier.example.com/verify/request-123',
  responseUri: 'https://verifier.example.com/verify/request-123',
  responseMode: 'direct_post',
  nonce: 'nonce-123',
  verifier: {
    clientId: 'redirect_uri:https://verifier.example.com/verify',
    name: 'Verifier API',
    allowedOrigins: ['https://verifier.example.com'],
  },
  matchedCredential: {
    id: 'credential-1',
    type: 'BangkokUniversityTranscript',
    rawVc: 'issuer.sd.jwt~disclosure~',
    claims: { vct: 'Transcript' },
    issuedAt: '2026-06-01T10:00:00.000Z',
  },
  disclosures: [],
  dcqlQuery: {
    credentials: [
      { id: 'transcript_sd_jwt', format: 'dc+sd-jwt', meta: { vct_values: ['Transcript'] } },
      { id: 'transcript_mdoc', format: 'mso_mdoc', meta: { type_values: ['org.iso.18013.5.1.mDL'] } },
    ],
  },
}

test('buildDualFormatDcqlVpToken assembles per-query-id tokens', async () => {
  const signSdJwtKb = jest.fn().mockResolvedValue('sd-jwt~kb.jwt')
  const readMdocEntry = jest.fn().mockResolvedValue('b64mdoc')

  const vpToken = await buildDualFormatDcqlVpToken(baseRequest, {
    signSdJwtKb,
    readMdocEntry,
  })

  expect(signSdJwtKb).toHaveBeenCalledWith({
    audience: baseRequest.clientId,
    nonce: 'nonce-123',
    sdJwt: baseRequest.matchedCredential.rawVc,
  })
  expect(readMdocEntry).toHaveBeenCalledWith('credential-1')
  expect(JSON.parse(vpToken)).toEqual({
    transcript_sd_jwt: ['sd-jwt~kb.jwt'],
    transcript_mdoc: ['b64mdoc'],
  })
})
