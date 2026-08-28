import { buildDualFormatDcqlVpToken } from './dualFormatVpToken'
import type { ResolvedPresentationRequest } from './presentationService'

const baseRequest: ResolvedPresentationRequest = {
  requestUri: 'openid4vp://authorize',
  clientId: 'redirect_uri:https://verifier.example.com/verify/request-123',
  responseUri: 'https://verifier.example.com/verify/request-123',
  responseMode: 'direct_post',
  nonce: 'nonce-123',
  protocolPath: 'legacy',
  verifier: {
    clientId: 'redirect_uri:https://verifier.example.com/verify',
    name: 'Verifier API',
    allowedOrigins: ['https://verifier.example.com'],
  },
  matchedCredential: {
    id: 'credential-1',
    type: 'ChulalongkornUniversityTranscript',
    rawVc: 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ~WyJzYWx0LWFnZSIsImFnZSIsMjVd~',
    claims: { vct: 'Transcript' },
    issuedAt: '2026-06-01T10:00:00.000Z',
  },
  disclosures: [],
  dcqlQuery: {
    credentials: [
      {
        id: 'transcript_sd_jwt',
        format: 'dc+sd-jwt',
        claims: [{ path: ['name'] }],
        meta: { vct_values: ['Transcript'] },
      },
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
    credentialId: 'credential-1',
    sdJwt: 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQWxpY2UiXQ~',
  })
  expect(readMdocEntry).toHaveBeenCalledWith('credential-1', baseRequest.matchedCredential.rawVc)
  expect(JSON.parse(vpToken)).toEqual({
    transcript_sd_jwt: ['sd-jwt~kb.jwt'],
    transcript_mdoc: ['b64mdoc'],
  })
})

test('buildDualFormatDcqlVpToken uses the shared SD-JWT predicate for vc+sd-jwt', async () => {
  const request: ResolvedPresentationRequest = {
    ...baseRequest,
    dcqlQuery: {
      credentials: [
        { ...baseRequest.dcqlQuery!.credentials[0]!, format: 'vc+sd-jwt' },
        baseRequest.dcqlQuery!.credentials[1]!,
      ],
    },
  }
  const signSdJwtKb = jest.fn().mockResolvedValue('sd-jwt~kb.jwt')
  const readMdocEntry = jest.fn().mockResolvedValue('b64mdoc')

  await expect(buildDualFormatDcqlVpToken(request, { signSdJwtKb, readMdocEntry })).resolves.toEqual(
    expect.any(String),
  )

  expect(signSdJwtKb).toHaveBeenCalledTimes(1)
  expect(readMdocEntry).toHaveBeenCalledTimes(1)
})

test('buildDualFormatDcqlVpToken assembles driving licence dual-format tokens', async () => {
  const request: ResolvedPresentationRequest = {
    ...baseRequest,
    matchedCredential: {
      id: 'dl-credential-1',
      type: 'DLTDrivingLicence',
      rawVc: 'issuer.sd.jwt~WyJzYWx0LW5hbWUiLCJuYW1lIiwiQm9iIl0~',
      claims: { vct: 'Iso18013DriversLicenseCredential' },
      issuedAt: '2026-06-01T10:00:00.000Z',
    },
    dcqlQuery: {
      credentials: [
        {
          id: 'driving_licence_sd_jwt',
          format: 'dc+sd-jwt',
          meta: { vct_values: ['Iso18013DriversLicenseCredential'] },
        },
        { id: 'driving_licence_mdoc', format: 'mso_mdoc', meta: { type_values: ['org.iso.18013.5.1.mDL'] } },
      ],
    },
  }

  const readMdocEntry = jest.fn().mockResolvedValue('b64mdoc')
  const vpToken = await buildDualFormatDcqlVpToken(request, {
    signSdJwtKb: jest.fn().mockResolvedValue('sd-jwt~kb.jwt'),
    readMdocEntry,
  })

  expect(readMdocEntry).toHaveBeenCalledWith('dl-credential-1', request.matchedCredential.rawVc)
  expect(vpToken).toContain('driving_licence_mdoc')
  expect(vpToken).toContain('driving_licence_sd_jwt')
})
