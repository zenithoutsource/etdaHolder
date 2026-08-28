/**
 * Maps DC API resolved presentations into consent-panel view models.
 */
import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

import {
  buildDcApiConsentRequest,
  readApprovedDcApiNamespaceKeys,
} from './dcApiConsentModel'
import type { DcApiResolvedPresentation } from './dcApiPresentationService'

const mdlCredential: VerifiableCredentialRecord = {
  id: 'mdl-credential-1',
  type: 'DLTDrivingLicence',
  rawVc: 'mdoc:AQIDBA',
  claims: {
    doctype: 'org.iso.18013.5.1.mDL',
    family_name: 'Example',
    given_name: 'Holder',
  },
  issuedAt: '2026-08-25T00:00:00.000Z',
}

function createResolved(): DcApiResolvedPresentation {
  return {
    sessionId: 'dc-session-1',
    protocol: 'openid4vp-v1-unsigned',
    origin: 'https://digital-credentials.dev',
    responseMode: 'dc_api',
    authorizationRequest: {
      response_mode: 'dc_api',
      nonce: 'nonce-1',
      dcql_query: {
        credentials: [
          {
            id: 'mdl',
            format: 'mso_mdoc',
            meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
            claims: [
              { path: ['org.iso.18013.5.1', 'family_name'] },
              { path: ['org.iso.18013.5.1', 'given_name'] },
            ],
          },
        ],
      },
    },
    dcqlQuery: {
      credentials: [
        {
          id: 'mdl',
          format: 'mso_mdoc',
          meta: { doctype_value: 'org.iso.18013.5.1.mDL' },
          claims: [
            { path: ['org.iso.18013.5.1', 'family_name'] },
            { path: ['org.iso.18013.5.1', 'given_name'] },
          ],
        },
      ],
    },
    selectedDcqlQueryId: 'mdl',
    matchedCredential: mdlCredential,
    nonce: 'nonce-1',
    requestedNamespaceKeys: [
      'org.iso.18013.5.1/family_name',
      'org.iso.18013.5.1/given_name',
    ],
  }
}

describe('dcApiConsentModel', () => {
  test('builds consent disclosures with ISO namespace keys', () => {
    const consentRequest = buildDcApiConsentRequest(createResolved())
    expect(consentRequest.disclosures.map((item) => item.key)).toEqual([
      'org.iso.18013.5.1/family_name',
      'org.iso.18013.5.1/given_name',
    ])
  })

  test('maps selected disclosure keys to approved namespace keys', () => {
    const approved = readApprovedDcApiNamespaceKeys(
      createResolved(),
      new Set(['org.iso.18013.5.1/family_name']),
    )
    expect(approved).toEqual(['org.iso.18013.5.1/family_name'])
  })

  test('builds consent disclosures for mdoc credentials whose claims live only in mdoc bytes', () => {
    const consentRequest = buildDcApiConsentRequest({
      ...createResolved(),
      matchedCredential: {
        ...mdlCredential,
        claims: { doctype: 'org.iso.18013.5.1.mDL' },
      },
    })

    expect(consentRequest.disclosures.map((item) => item.key)).toEqual([
      'org.iso.18013.5.1/family_name',
      'org.iso.18013.5.1/given_name',
    ])
  })
})
