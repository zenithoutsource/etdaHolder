import {
  acquireDualFormatForPreview,
  claimDualFormatCredential,
  isDualFormatOffer,
  selectOfferForSingleFormatAcquire,
} from './dualFormatIssuance'
import type { ResolvedCredentialOffer, VerifiableCredentialRecord } from '../vci/exchangeService'

const sdJwtRecord: VerifiableCredentialRecord = {
  id: 'vc-transcript',
  type: 'ChulalongkornUniversityTranscript',
  rawVc: 'issuer.jwt~disclosure~',
  claims: { student_id: 'S-001' },
  issuedAt: '2026-01-01T00:00:00.000Z',
}

function makeDualOffer(): ResolvedCredentialOffer {
  return {
    offerUri: 'openid-credential-offer://test',
    issuer: 'https://issuer.example.com',
    credentialOffer: {} as ResolvedCredentialOffer['credentialOffer'],
    issuerMetadata: {
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {},
    } as ResolvedCredentialOffer['issuerMetadata'],
    credentialConfigurations: [
      {
        id: 'TranscriptCredential_dc+sd-jwt',
        requestId: 'TranscriptCredential_dc+sd-jwt',
        format: 'dc+sd-jwt',
        rawConfiguration: { format: 'dc+sd-jwt', logical_credential_id: 'transcript-1', vct: 'Transcript' } as unknown as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
      },
      {
        id: 'TranscriptCredential_mso_mdoc',
        requestId: 'TranscriptCredential_mso_mdoc',
        format: 'mso_mdoc',
        rawConfiguration: {
          format: 'mso_mdoc',
          doctype: 'th.go.etda.transcript',
          logical_credential_id: 'transcript-1',
        } as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
      },
    ],
    preAuthorizedCode: 'pre-auth',
    supportedFlows: ['pre-authorized_code'],
    version: 1,
  }
}

test('isDualFormatOffer detects paired configurations', () => {
  expect(isDualFormatOffer(makeDualOffer().credentialConfigurations)).toBe(true)
})

test('selectOfferForSingleFormatAcquire prefers the SD-JWT sibling for dual-format offers', () => {
  const offer = makeDualOffer()
  // Put mso_mdoc first — same order as customer mDL + SD-JWT offers.
  offer.credentialConfigurations = [
    offer.credentialConfigurations[1]!,
    offer.credentialConfigurations[0]!,
  ]

  const selected = selectOfferForSingleFormatAcquire(offer)

  expect(selected.credentialConfigurations).toHaveLength(1)
  expect(selected.credentialConfigurations[0]?.format).toBe('dc+sd-jwt')
  expect(selected.credentialConfigurations[0]?.id).toBe('TranscriptCredential_dc+sd-jwt')
})

test('acquireDualFormatForPreview returns SD-JWT and pending mDOC without storing', async () => {
  const offer = makeDualOffer()
  const acquireCalls: string[] = []

  const result = await acquireDualFormatForPreview(offer, {
    dependencies: {
      acquireAccessToken: async () => ({
        accessToken: 'shared-token',
        cNonce: 'nonce-1',
      }),
      acquireCredentialRecord: async (sliced) => {
        const format = sliced.credentialConfigurations[0]?.format
        acquireCalls.push(format ?? 'unknown')
        if (format === 'mso_mdoc') {
          return {
            id: 'mdoc-hash',
            type: 'ChulalongkornUniversityTranscript',
            rawVc: 'mdoc:AQIDBA',
            claims: { doctype: 'th.go.etda.transcript' },
            issuedAt: '2026-01-01T00:00:00.000Z',
          }
        }
        return sdJwtRecord
      },
      signProof: async () => 'proof',
      requestCredential: async () => 'unused',
      getCredentialStorage: () => ({
        getString: () => undefined,
        set: () => undefined,
      }),
    },
  })

  expect(acquireCalls).toEqual(['dc+sd-jwt', 'mso_mdoc'])
  expect(result.primaryRecord.id).toBe('vc-transcript')
  expect(result.pendingMdoc).toEqual({
    docType: 'th.go.etda.transcript',
    configurationId: 'TranscriptCredential_mso_mdoc',
    rawBase64: 'AQIDBA',
  })
})

test('claimDualFormatCredential links both formats under one logical credential', async () => {
  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }

  const offer = makeDualOffer()

  const result = await claimDualFormatCredential(offer, {
    tx_code: '123456',
    dependencies: {
      acquireAccessToken: async () => ({
        accessToken: 'shared-token',
        cNonce: 'nonce-1',
      }),
      acquireCredentialRecord: async (offer) => {
        const format = offer.credentialConfigurations[0]?.format
        if (format === 'mso_mdoc') {
          return {
            id: 'mdoc-hash',
            type: 'ChulalongkornUniversityTranscript',
            rawVc: 'mdoc:AQIDBA',
            claims: { doctype: 'th.go.etda.transcript' },
            issuedAt: '2026-01-01T00:00:00.000Z',
          }
        }
        return sdJwtRecord
      },
      storeMdoc: async () => undefined,
      getCredentialStorage: () => credentialStorage,
    },
  })

  expect(result.partial).toBe(false)
  expect(result.primaryRecord.id).toBe(sdJwtRecord.id)
  expect(result.logicalCredential.logicalCredentialId).toBe('transcript-1')
  expect(result.logicalCredential.formats['dc+sd-jwt']?.rawCredentialRef).toBe(sdJwtRecord.id)
  expect(result.logicalCredential.formats['mso_mdoc']?.rawCredentialRef).toBe(sdJwtRecord.id)
})
