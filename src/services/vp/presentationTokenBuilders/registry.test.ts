import { buildApprovedPresentationResponse } from './registry'

test('selects dual-format DCQL builder before standard DCQL', async () => {
  const buildDualFormatDcqlVpToken = jest.fn().mockResolvedValue('{"a":["token"]}')
  const response = await buildApprovedPresentationResponse(
    {
      requestUri: 'openid4vp://authorize',
      clientId: 'client',
      responseUri: 'https://verifier.example/verify',
      responseMode: 'direct_post',
      nonce: 'nonce',
      verifier: { clientId: 'client', name: 'Verifier', allowedOrigins: ['https://verifier.example'] },
      matchedCredential: {
        id: 'cred-1',
        type: 'BangkokUniversityTranscript',
        rawVc: 'sd.jwt~',
        claims: {},
        issuedAt: '2026-01-01T00:00:00.000Z',
      },
      disclosures: [],
      dcqlQuery: {
        credentials: [
          { id: 'sd', format: 'dc+sd-jwt' },
          { id: 'mdoc', format: 'mso_mdoc' },
        ],
      },
    },
    { buildDualFormatDcqlVpToken },
  )

  expect(buildDualFormatDcqlVpToken).toHaveBeenCalled()
  expect(response.vpToken).toBe('{"a":["token"]}')
})
