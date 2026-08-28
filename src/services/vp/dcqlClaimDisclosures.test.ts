import type { VerifiableCredentialRecord } from '@/src/services/vci/exchangeService'

import { buildDcqlClaimDisclosures } from './dcqlClaimDisclosures'
import type { DcqlQuery } from './presentationService'

const mdlCredential: VerifiableCredentialRecord = {
  id: 'mdl-credential-1',
  type: 'DLTDrivingLicence',
  rawVc: 'mdoc:AQIDBA',
  claims: {
    doctype: 'org.iso.18013.5.1.mDL',
  },
  issuedAt: '2026-08-25T00:00:00.000Z',
}

const mdocQuery: DcqlQuery = {
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
}

describe('buildDcqlClaimDisclosures', () => {
  test('includes requested mdoc fields when claims are stored only in native mdoc bytes', () => {
    const disclosures = buildDcqlClaimDisclosures(mdlCredential, mdocQuery)

    expect(disclosures?.map((item) => item.key)).toEqual([
      'org.iso.18013.5.1/family_name',
      'org.iso.18013.5.1/given_name',
    ])
  })
})
