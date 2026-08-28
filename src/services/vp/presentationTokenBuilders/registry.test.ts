import { buildApprovedPresentationResponse } from './registry'

jest.mock('../oid4vpMdocDeviceResponse', () => ({
  buildOid4vpMdocVpTokenEntry: jest.fn().mockResolvedValue('b64mdoc'),
}))

import { buildOid4vpMdocVpTokenEntry } from '../oid4vpMdocDeviceResponse'

test('selects dual-format DCQL builder before standard DCQL', async () => {
  const buildDualFormatDcqlVpToken = jest.fn().mockResolvedValue('{"a":["token"]}')
  const response = await buildApprovedPresentationResponse(
    {
      requestUri: 'openid4vp://authorize',
      clientId: 'client',
      responseUri: 'https://verifier.example/verify',
      responseMode: 'direct_post',
      nonce: 'nonce',
      protocolPath: 'legacy',
      verifier: { clientId: 'client', name: 'Verifier', allowedOrigins: ['https://verifier.example'] },
      matchedCredential: {
        id: 'cred-1',
        type: 'ChulalongkornUniversityTranscript',
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

test('builds standalone mso_mdoc DCQL through OID4VP DeviceResponse builder', async () => {
  const response = await buildApprovedPresentationResponse(
    {
      requestUri: 'openid4vp://authorize',
      clientId: 'client',
      responseUri: 'https://verifier.example/verify',
      responseMode: 'direct_post',
      nonce: 'nonce',
      protocolPath: 'legacy',
      verifier: { clientId: 'client', name: 'Verifier', allowedOrigins: ['https://verifier.example'] },
      matchedCredential: {
        id: 'tonyhere-mdoc-1',
        type: 'DLTDrivingLicence',
        rawVc: 'mdoc:AQIDBA',
        claims: { doctype: 'org.iso.18013.5.1.mDL' },
        issuedAt: '2026-01-01T00:00:00.000Z',
        issuerUrl: 'https://demo.tonyhere.work',
      },
      disclosures: [],
      dcqlQuery: {
        credentials: [
          { id: 'mdoc_credential', format: 'mso_mdoc', meta: { doctype_value: 'org.iso.18013.5.1.mDL' } },
        ],
      },
    },
  )

  expect(buildOid4vpMdocVpTokenEntry).toHaveBeenCalled()
  expect(response.vpToken).toBe('b64mdoc')
})

test('passes holder-selected namespace/identifier keys to the mdoc DeviceResponse builder', async () => {
  await buildApprovedPresentationResponse(
    {
      requestUri: 'openid4vp://authorize',
      clientId: 'client',
      responseUri: 'https://verifier.example/verify',
      responseMode: 'direct_post.jwt',
      nonce: 'nonce',
      protocolPath: 'legacy',
      verifier: { clientId: 'client', name: 'Verifier', allowedOrigins: ['https://verifier.example'] },
      matchedCredential: {
        id: 'tonyhere-mdoc-1',
        type: 'DLTDrivingLicence',
        rawVc: 'mdoc:AQIDBA',
        claims: { doctype: 'org.iso.18013.5.1.mDL', family_name: 'Ada' },
        issuedAt: '2026-01-01T00:00:00.000Z',
      },
      disclosures: [{
        key: 'org.iso.18013.5.1/family_name',
        label: 'Family Name',
        value: 'Ada',
      }],
      dcqlQuery: {
        credentials: [{
          id: 'mdoc_credential',
          format: 'mso_mdoc',
          meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
          claims: [{ path: ['org.iso.18013.5.1', 'family_name'] }],
        }],
      },
    },
    { selectedClaimKeys: ['org.iso.18013.5.1/family_name'] },
  )

  expect(buildOid4vpMdocVpTokenEntry).toHaveBeenCalledWith({
    request: expect.objectContaining({ matchedCredential: expect.objectContaining({ id: 'tonyhere-mdoc-1' }) }),
    selectedClaimKeys: ['org.iso.18013.5.1/family_name'],
  })
})
