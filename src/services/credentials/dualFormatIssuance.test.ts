import {
  acquireDrivingLicenceMdocOnlyForPreview,
  acquireDualFormatForPreview,
  claimDualFormatCredential,
  finalizeDualFormatCredential,
  isDualFormatOffer,
  isDrivingLicenceDualFormatOffer,
  selectOfferForSingleFormatAcquire,
} from './dualFormatIssuance'
import type { ResolvedCredentialOffer, VerifiableCredentialRecord } from '../vci/exchangeService'
import { saveCredentialRecord } from '../vci/exchangeService'
import { makeTestOid4vcContext } from '../vci/testFixtures'
import { readLogicalCredential } from './logicalCredentialStorage'
import { getMetaStorage } from '../storage/storage'
import { WALLET_CRYPTO_V2_META_KEY } from '@/src/config/walletCryptoPolicy'
import { discardPendingCredentialKey } from '../crypto/credentialSigningKey'

jest.mock('../notifications/documentExpiryNotificationService', () => ({
  cancelDocumentExpiryNotifications: jest.fn(async () => undefined),
}))

const sdJwtRecord: VerifiableCredentialRecord = {
  id: 'vc-transcript',
  type: 'ChulalongkornUniversityTranscript',
  rawVc: 'issuer.jwt~disclosure~',
  claims: { student_id: 'S-001' },
  issuedAt: '2026-01-01T00:00:00.000Z',
}

function makeDrivingLicenceDualOffer(): ResolvedCredentialOffer {
  return {
    offerUri: 'openid-credential-offer://driving',
    issuer: 'https://issuer.example.com',
    credentialOffer: {} as ResolvedCredentialOffer['credentialOffer'],
    issuerMetadata: {
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {},
    } as ResolvedCredentialOffer['issuerMetadata'],
    credentialConfigurations: [
      {
        id: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
        requestId: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
        format: 'dc+sd-jwt',
        rawConfiguration: {
          format: 'dc+sd-jwt',
          logical_credential_id: 'driving-1',
          vct: 'Iso18013DriversLicenseCredential',
        } as unknown as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
      },
      {
        id: 'org.iso.18013.5.1.mDL',
        requestId: 'Iso18013DriversLicenseCredential_mso_mdoc',
        format: 'mso_mdoc',
        rawConfiguration: {
          format: 'mso_mdoc',
          doctype: 'org.iso.18013.5.1.mDL',
          logical_credential_id: 'driving-1',
        } as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
      },
    ],
    preAuthorizedCode: 'pre-auth',
    supportedFlows: ['pre-authorized_code'],
    version: 1,
    protocolPath: 'oid4vc',
    oid4vcContext: makeTestOid4vcContext('https://issuer.example.com', [
      'Iso18013DriversLicenseCredential_dc+sd-jwt',
      'org.iso.18013.5.1.mDL',
    ]),
  }
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
    protocolPath: 'oid4vc',
    oid4vcContext: makeTestOid4vcContext('https://issuer.example.com', [
      'TranscriptCredential_dc+sd-jwt',
      'TranscriptCredential_mso_mdoc',
    ]),
  }
}

test('isDrivingLicenceDualFormatOffer detects ISO mDL dual-format offers', () => {
  expect(isDrivingLicenceDualFormatOffer(makeDrivingLicenceDualOffer().credentialConfigurations)).toBe(true)
  expect(isDrivingLicenceDualFormatOffer(makeDualOffer().credentialConfigurations)).toBe(false)
})

test('acquireDrivingLicenceMdocOnlyForPreview acquires mDOC only and returns a placeholder primary record', async () => {
  const offer = makeDrivingLicenceDualOffer()
  const acquireCalls: string[] = []

  const result = await acquireDrivingLicenceMdocOnlyForPreview(offer, {
    dependencies: {
      acquireAccessToken: async () => ({
        accessToken: 'shared-token',
        cNonce: 'nonce-1',
      }),
      acquireCredentialRecord: async (sliced) => {
        const format = sliced.credentialConfigurations[0]?.format
        acquireCalls.push(format ?? 'unknown')
        return {
          id: 'mdoc-hash',
          type: 'DLTDrivingLicence',
          rawVc: 'mdoc:AQIDBA',
          claims: { doctype: 'org.iso.18013.5.1.mDL' },
          issuedAt: '2026-01-01T00:00:00.000Z',
        }
      },
      signProof: async () => 'proof',
      requestCredential: async () => 'unused',
      getCredentialStorage: () => ({
        getString: () => undefined,
        set: () => undefined,
      }),
    },
  })

  expect(acquireCalls).toEqual(['mso_mdoc'])
  expect(result.primaryRecord.type).toBe('DLTDrivingLicence')
  expect(result.primaryRecord.rawVc).toBe('')
  expect(result.pendingMdoc).toEqual({
    docType: 'org.iso.18013.5.1.mDL',
    configurationId: 'org.iso.18013.5.1.mDL',
    sdJwtConfigurationId: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
    logicalCredentialId: 'driving-1',
    issuer: 'https://issuer.example.com',
    rawBase64: 'AQIDBA',
  })
})

test('acquireDrivingLicenceMdocOnlyForPreview propagates mDOC failure without attempting SD-JWT', async () => {
  const acquireRecord = jest.fn(async () => {
    throw new Error('MdocCredentialInvalid: issuer rejected mDOC request')
  })

  await expect(
    acquireDrivingLicenceMdocOnlyForPreview(makeDrivingLicenceDualOffer(), {
      dependencies: {
        acquireAccessToken: async () => ({
          accessToken: 'shared-token',
          cNonce: 'nonce-1',
        }),
        acquireCredentialRecord: acquireRecord as typeof import('../vci/exchangeService').acquireCredentialRecord,
        signProof: async () => 'unused',
        requestCredential: async () => 'unused',
        getCredentialStorage: () => ({
          getString: () => undefined,
          set: () => undefined,
        }),
      },
    }),
  ).rejects.toThrow('MdocCredentialInvalid: issuer rejected mDOC request')

  expect(acquireRecord).toHaveBeenCalledTimes(1)
})

test('finalizeDualFormatCredential stores mDOC-only driving licence with warning consistency status', async () => {
  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }
  const record: VerifiableCredentialRecord = {
    id: 'https://issuer.example.com:org.iso.18013.5.1.mDL',
    type: 'DLTDrivingLicence',
    rawVc: '',
    claims: { docType: 'org.iso.18013.5.1.mDL' },
    issuedAt: '2026-01-01T00:00:00.000Z',
    issuerUrl: 'https://issuer.example.com',
  }
  const pendingMdoc = {
    docType: 'org.iso.18013.5.1.mDL',
    configurationId: 'org.iso.18013.5.1.mDL',
    sdJwtConfigurationId: 'Iso18013DriversLicenseCredential_dc+sd-jwt',
    logicalCredentialId: 'driving-1',
    issuer: 'https://issuer.example.com',
    rawBase64: 'AQIDBA',
  }

  const logicalCredential = await finalizeDualFormatCredential(record, pendingMdoc, {
    getCredentialStorage: () => credentialStorage,
    storeMdoc: async () => undefined,
    saveCredentialRecord: (savedRecord) =>
      saveCredentialRecord(savedRecord, { getCredentialStorage: () => credentialStorage }),
    saveLogicalCredential: (logicalCredentialToSave, logicalStorage) => {
      const { saveLogicalCredential: save } = jest.requireActual<typeof import('./logicalCredentialStorage')>('./logicalCredentialStorage')
      save(logicalCredentialToSave, logicalStorage)
    },
    markCredentialAsNew: jest.fn(),
    hasMdoc: async () => false,
  })

  expect(logicalCredential.consistencyStatus).toBe('warning')
  expect(logicalCredential.warnings).toContain('dc+sd-jwt not acquired (mDOC-only debug slice)')
  expect(logicalCredential.formats['mso_mdoc']?.rawCredentialRef).toBe(record.id)
  expect(logicalCredential.formats['dc+sd-jwt']).toBeUndefined()
})

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
    sdJwtConfigurationId: 'TranscriptCredential_dc+sd-jwt',
    logicalCredentialId: 'transcript-1',
    issuer: 'https://issuer.example.com',
    rawBase64: 'AQIDBA',
  })
})

test('acquireDualFormatForPreview shares one proof signing session across both formats', async () => {
  const offer = makeDualOffer()
  const signProof = jest.fn(async (
    _nonce: string,
    _audience: string,
    _options?: { keyBinding?: 'did-kid' | 'jwk' },
  ) => 'proof')
  const close = jest.fn()
  const createProofSigningSession = jest.fn(async () => ({
    signProof,
    close,
  }))
  const directSignProof = jest.fn(async () => 'direct-proof')
  const acquireRecord = jest.fn(async (
    sliced: ResolvedCredentialOffer,
    options: {
      dependencies?: { signProof?: typeof signProof }
      reuseToken?: { cNonce: string }
      onCNonceUpdated?: (cNonce: string) => void
    },
  ) => {
    const format = sliced.credentialConfigurations[0]?.format
    await options.dependencies?.signProof?.(
      options.reuseToken?.cNonce ?? 'missing-nonce',
      offer.issuer,
      { keyBinding: format === 'mso_mdoc' ? 'jwk' : 'did-kid' },
    )
    if (format === 'dc+sd-jwt') {
      options.onCNonceUpdated?.('fresh-nonce')
    }

    return format === 'mso_mdoc'
      ? {
          id: 'mdoc-hash',
          type: 'ChulalongkornUniversityTranscript',
          rawVc: 'mdoc:AQIDBA',
          claims: { doctype: 'th.go.etda.transcript' },
          issuedAt: '2026-01-01T00:00:00.000Z',
        }
      : sdJwtRecord
  })

  await acquireDualFormatForPreview(offer, {
    dependencies: {
      acquireAccessToken: async () => ({
        accessToken: 'shared-token',
        cNonce: 'shared-nonce',
      }),
      acquireCredentialRecord: acquireRecord as typeof import('../vci/exchangeService').acquireCredentialRecord,
      createProofSigningSession,
      signProof: directSignProof,
      requestCredential: async () => 'unused',
      getCredentialStorage: () => ({
        getString: () => undefined,
        set: () => undefined,
      }),
    },
  })

  expect(createProofSigningSession).toHaveBeenCalledTimes(1)
  expect(acquireRecord).toHaveBeenCalledTimes(2)
  expect(signProof).toHaveBeenCalledTimes(2)
  expect(acquireRecord.mock.calls[1]?.[1].reuseToken?.cNonce).toBe('fresh-nonce')
  expect(directSignProof).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledTimes(1)
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

test('finalizeDualFormatCredential stores both formats and marks new only after linking', async () => {
  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }
  const events: string[] = []
  const record: VerifiableCredentialRecord = {
    ...sdJwtRecord,
    issuerUrl: 'https://issuer.example.com',
    credentialConfigurationId: 'TranscriptCredential_dc+sd-jwt',
  }
  const pendingMdoc = {
    docType: 'th.go.etda.transcript',
    configurationId: 'TranscriptCredential_mso_mdoc',
    sdJwtConfigurationId: 'TranscriptCredential_dc+sd-jwt',
    logicalCredentialId: 'transcript-1',
    rawBase64: 'AQIDBA',
  }

  await finalizeDualFormatCredential(record, pendingMdoc, {
    getCredentialStorage: () => credentialStorage,
    storeMdoc: async () => {
      events.push('mdoc')
    },
    saveCredentialRecord: (savedRecord) => {
      events.push('record')
      saveCredentialRecord(savedRecord, { getCredentialStorage: () => credentialStorage })
    },
    saveLogicalCredential: (logicalCredential, logicalStorage) => {
      events.push('logical')
      const { saveLogicalCredential: save } = jest.requireActual<typeof import('./logicalCredentialStorage')>('./logicalCredentialStorage')
      save(logicalCredential, logicalStorage)
    },
    markCredentialAsNew: () => {
      events.push('badge')
    },
    hasMdoc: async () => false,
    refreshCredentials: () => {
      events.push('refresh')
    },
  })

  expect(events).toEqual(['mdoc', 'record', 'logical', 'badge', 'refresh'])
  expect(readLogicalCredential('transcript-1', credentialStorage)?.formats).toEqual({
    'dc+sd-jwt': expect.objectContaining({
      rawCredentialRef: 'vc-transcript',
      credentialConfigurationId: 'TranscriptCredential_dc+sd-jwt',
    }),
    mso_mdoc: expect.objectContaining({
      rawCredentialRef: 'vc-transcript',
      credentialConfigurationId: 'TranscriptCredential_mso_mdoc',
    }),
  })
})

test('finalizeDualFormatCredential rolls back the record and mDOC when linking fails', async () => {
  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }
  const deleteMdoc = jest.fn(async () => undefined)
  const record: VerifiableCredentialRecord = {
    ...sdJwtRecord,
    issuerUrl: 'https://issuer.example.com',
    credentialConfigurationId: 'TranscriptCredential_dc+sd-jwt',
  }
  const pendingMdoc = {
    docType: 'th.go.etda.transcript',
    configurationId: 'TranscriptCredential_mso_mdoc',
    sdJwtConfigurationId: 'TranscriptCredential_dc+sd-jwt',
    logicalCredentialId: 'transcript-1',
    rawBase64: 'AQIDBA',
  }

  await expect(
    finalizeDualFormatCredential(record, pendingMdoc, {
      getCredentialStorage: () => credentialStorage,
      storeMdoc: async () => undefined,
      deleteMdoc,
      hasMdoc: async () => false,
      saveCredentialRecord: (savedRecord) =>
        saveCredentialRecord(savedRecord, { getCredentialStorage: () => credentialStorage }),
      saveLogicalCredential: () => {
        throw new Error('logical-link-failed')
      },
      markCredentialAsNew: jest.fn(),
    }),
  ).rejects.toThrow('logical-link-failed')

  expect(deleteMdoc).toHaveBeenCalledWith(record.id)
  expect(storage.get('credential:index')).toBeUndefined()
  expect(storage.get(`credential:${record.id}`)).toBeUndefined()
})

test('finalizeDualFormatCredential retains native mDOC when presence is unknown', async () => {
  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }
  const storeMdoc = jest.fn(async () => undefined)
  const deleteMdoc = jest.fn(async () => undefined)
  const record: VerifiableCredentialRecord = {
    ...sdJwtRecord,
    issuerUrl: 'https://issuer.example.com',
    credentialConfigurationId: 'TranscriptCredential_dc+sd-jwt',
  }
  const pendingMdoc = {
    docType: 'th.go.etda.transcript',
    configurationId: 'TranscriptCredential_mso_mdoc',
    sdJwtConfigurationId: 'TranscriptCredential_dc+sd-jwt',
    logicalCredentialId: 'transcript-1',
    rawBase64: 'AQIDBA',
  }

  await expect(
    finalizeDualFormatCredential(record, pendingMdoc, {
      getCredentialStorage: () => credentialStorage,
      hasMdoc: async () => undefined,
      storeMdoc,
      deleteMdoc,
    }),
  ).rejects.toThrow('MdocPresenceUnknown')

  expect(storeMdoc).not.toHaveBeenCalled()
  expect(deleteMdoc).not.toHaveBeenCalled()
})

test('finalizeDualFormatCredential restores existing native mDOC after a later write fails', async () => {
  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }
  const originalMdocBytes = new Uint8Array([9, 8, 7])
  let nativeMdocBytes: Uint8Array | undefined = originalMdocBytes.slice()
  const storedMdocSnapshots: Uint8Array[] = []
  const storeMdoc = jest.fn(async (_record: unknown, bytes: Uint8Array) => {
    storedMdocSnapshots.push(bytes.slice())
    nativeMdocBytes = bytes.slice()
  })
  const deleteMdoc = jest.fn(async () => {
    nativeMdocBytes = undefined
  })
  const record: VerifiableCredentialRecord = {
    ...sdJwtRecord,
    issuerUrl: 'https://issuer.example.com',
    credentialConfigurationId: 'TranscriptCredential_dc+sd-jwt',
  }
  const pendingMdoc = {
    docType: 'th.go.etda.transcript',
    configurationId: 'TranscriptCredential_mso_mdoc',
    sdJwtConfigurationId: 'TranscriptCredential_dc+sd-jwt',
    logicalCredentialId: 'transcript-1',
    rawBase64: 'AQIDBA',
  }

  await expect(
    finalizeDualFormatCredential(record, pendingMdoc, {
      getCredentialStorage: () => credentialStorage,
      hasMdoc: async () => true,
      readMdoc: async () => originalMdocBytes.slice(),
      storeMdoc,
      deleteMdoc,
      saveCredentialRecord: () => undefined,
      saveLogicalCredential: () => {
        throw new Error('logical-link-failed')
      },
    }),
  ).rejects.toThrow('logical-link-failed')

  expect(deleteMdoc).toHaveBeenCalledWith(record.id)
  expect(storeMdoc).toHaveBeenCalledTimes(2)
  expect(storedMdocSnapshots[1]).toEqual(originalMdocBytes)
  expect(nativeMdocBytes).toEqual(originalMdocBytes)
})

test('acquireDualFormatForPreview uses the pending v2 credential key for its shared proof session', async () => {
  const metaStorage = getMetaStorage()
  metaStorage.set(WALLET_CRYPTO_V2_META_KEY, 'true')

  let sessionKeyId: string | undefined
  const signProof = jest.fn(async (
    _nonce: string,
    _audience: string,
    options?: { keyBinding?: 'did-kid' | 'jwk'; credentialKeyId?: string },
  ) => {
    if (options?.credentialKeyId !== sessionKeyId) {
      throw new Error('CredentialKeySigningSessionRequired')
    }
    return 'proof'
  })
  const bindCredentialKey = jest.fn(async () => undefined)
  const createProofSigningSession = jest.fn(async (credentialKeyId?: string) => {
    sessionKeyId = credentialKeyId
    return {
      credentialKeyId,
      signProof,
      close: jest.fn(),
      bindCredentialKey,
    }
  })
  const acquireRecord = jest.fn(async (
    sliced: ResolvedCredentialOffer,
    options: {
      pendingCredentialKeyId?: string
      proofSession?: {
        signProof: typeof signProof
      }
    },
  ) => {
    const credentialKeyId = options.pendingCredentialKeyId ?? 'pending-key'
    await options.proofSession?.signProof(
      'nonce',
      'https://issuer.example.com',
      {
        keyBinding: sliced.credentialConfigurations[0]?.format === 'mso_mdoc' ? 'jwk' : 'did-kid',
        credentialKeyId,
      },
    )

    return sliced.credentialConfigurations[0]?.format === 'mso_mdoc'
      ? {
          id: 'mdoc-hash',
          type: 'DLTDrivingLicence',
          rawVc: 'mdoc:AQIDBA',
          claims: { doctype: 'org.iso.18013.5.1.mDL' },
          issuedAt: '2026-01-01T00:00:00.000Z',
        }
      : {
          ...sdJwtRecord,
          type: 'DLTDrivingLicence',
        }
  })

  let acquiredPendingKeyId: string | undefined
  try {
    const result = await acquireDualFormatForPreview(makeDualOffer(), {
      dependencies: {
        acquireAccessToken: async () => ({
          accessToken: 'shared-token',
          cNonce: 'nonce',
        }),
        acquireCredentialRecord: acquireRecord as typeof import('../vci/exchangeService').acquireCredentialRecord,
        createProofSigningSession,
        signProof: async () => 'unused',
        requestCredential: async () => 'unused',
        getCredentialStorage: () => ({
          getString: () => undefined,
          set: () => undefined,
        }),
      },
    })

    expect(result).toEqual(expect.objectContaining({
      primaryRecord: expect.objectContaining({ type: 'DLTDrivingLicence' }),
    }))
    acquiredPendingKeyId = result.pendingMdoc?.pendingCredentialKeyId
    expect(bindCredentialKey).not.toHaveBeenCalled()
    expect(acquiredPendingKeyId).toBeDefined()
  } finally {
    if (acquiredPendingKeyId) {
      await discardPendingCredentialKey(acquiredPendingKeyId)
    }
    metaStorage.remove(WALLET_CRYPTO_V2_META_KEY)
  }
})

test('aborted dual-format preview discards its shared pending key', async () => {
  const metaStorage = getMetaStorage()
  metaStorage.set(WALLET_CRYPTO_V2_META_KEY, 'true')

  const abortController = new AbortController()
  const discardPendingKey = jest.fn(async () => undefined)
  const acquireRecord = jest.fn(async (sliced: ResolvedCredentialOffer) => {
    if (sliced.credentialConfigurations[0]?.format === 'dc+sd-jwt') {
      abortController.abort()
    }
    return sdJwtRecord
  })

  try {
    await expect(
      acquireDualFormatForPreview(makeDualOffer(), {
        signal: abortController.signal,
        dependencies: {
          acquireCredentialRecord: acquireRecord as typeof import('../vci/exchangeService').acquireCredentialRecord,
          createPendingCredentialKey: async () => 'pending-abort-key',
          createProofSigningSession: async (credentialKeyId) => ({
            credentialKeyId,
            signProof: async () => 'proof',
            close: jest.fn(),
          }),
          discardPendingCredentialKey: discardPendingKey,
          acquireAccessToken: async () => ({
            accessToken: 'shared-token',
            cNonce: 'nonce',
          }),
          signProof: async () => 'unused',
          requestCredential: async () => 'unused',
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    ).rejects.toThrow('CredentialAcquisitionAborted')

    expect(discardPendingKey).toHaveBeenCalledWith('pending-abort-key')
    expect(acquireRecord).toHaveBeenCalledTimes(1)
  } finally {
    metaStorage.remove(WALLET_CRYPTO_V2_META_KEY)
  }
})

test('claimDualFormatCredential binds after SD-JWT save and rolls back on bind failure', async () => {
  const metaStorage = getMetaStorage()
  metaStorage.set(WALLET_CRYPTO_V2_META_KEY, 'true')

  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }
  const bindPendingKey = jest.fn(async () => {
    throw new Error('Ed25519SeedKeychainWriteFailed')
  })
  const discardPendingKey = jest.fn(async () => undefined)

  try {
    await expect(
      claimDualFormatCredential(makeDualOffer(), {
        pendingCredentialKeyId: 'pending-bind-fail',
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
          createProofSigningSession: async (credentialKeyId) => ({
            credentialKeyId,
            signProof: async () => 'proof',
            close: jest.fn(),
          }),
          bindPendingCredentialKey: bindPendingKey,
          discardPendingCredentialKey: discardPendingKey,
          storeMdoc: async () => undefined,
          getCredentialStorage: () => credentialStorage,
        },
      }),
    ).rejects.toThrow('Ed25519SeedKeychainWriteFailed')

    expect(bindPendingKey).toHaveBeenCalledWith(
      'pending-bind-fail',
      sdJwtRecord.id,
      sdJwtRecord.type,
    )
    expect(storage.has(`credential:${sdJwtRecord.id}`)).toBe(false)
    expect(discardPendingKey).toHaveBeenCalledWith('pending-bind-fail')
  } finally {
    metaStorage.remove(WALLET_CRYPTO_V2_META_KEY)
  }
})

test('claimDualFormatCredential rolls back native mDOC when mdoc-only bind fails', async () => {
  const metaStorage = getMetaStorage()
  metaStorage.set(WALLET_CRYPTO_V2_META_KEY, 'true')

  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }
  const bindPendingKey = jest.fn(async () => {
    throw new Error('Ed25519SeedKeychainWriteFailed')
  })
  const discardPendingKey = jest.fn(async () => undefined)
  const deleteMdoc = jest.fn(async () => undefined)
  const storeMdoc = jest.fn(async () => undefined)

  try {
    await expect(
      claimDualFormatCredential(makeDualOffer(), {
        pendingCredentialKeyId: 'pending-mdoc-bind-fail',
        dependencies: {
          acquireAccessToken: async () => ({
            accessToken: 'shared-token',
            cNonce: 'nonce-1',
          }),
          acquireCredentialRecord: async (offer) => {
            const format = offer.credentialConfigurations[0]?.format
            if (format === 'dc+sd-jwt') {
              throw new Error('sd-jwt-issuer-unavailable')
            }
            return {
              id: 'mdoc-hash',
              type: 'ChulalongkornUniversityTranscript',
              rawVc: 'mdoc:AQIDBA',
              claims: { doctype: 'th.go.etda.transcript' },
              issuedAt: '2026-01-01T00:00:00.000Z',
            }
          },
          createProofSigningSession: async (credentialKeyId) => ({
            credentialKeyId,
            signProof: async () => 'proof',
            close: jest.fn(),
          }),
          bindPendingCredentialKey: bindPendingKey,
          discardPendingCredentialKey: discardPendingKey,
          storeMdoc,
          deleteMdoc,
          getCredentialStorage: () => credentialStorage,
        },
      }),
    ).rejects.toThrow('Ed25519SeedKeychainWriteFailed')

    expect(storeMdoc).toHaveBeenCalled()
    expect(bindPendingKey).toHaveBeenCalled()
    expect(deleteMdoc).toHaveBeenCalled()
    expect(discardPendingKey).toHaveBeenCalledWith('pending-mdoc-bind-fail')
  } finally {
    metaStorage.remove(WALLET_CRYPTO_V2_META_KEY)
  }
})

test('claimDualFormatCredential keeps SD-JWT key when mdoc fails after bind', async () => {
  const metaStorage = getMetaStorage()
  metaStorage.set(WALLET_CRYPTO_V2_META_KEY, 'true')

  const storage = new Map<string, string>()
  const credentialStorage = {
    getString: (key: string) => storage.get(key),
    set: (key: string, value: string) => {
      storage.set(key, value)
    },
    remove: (key: string) => storage.delete(key),
  }
  const bindPendingKey = jest.fn(async (
    _pendingId: string,
    credentialId: string,
    credentialType: string,
  ) => ({
    credentialId,
    holderDid: 'did:key:z6MkdualFormatPartial',
    keychainService: `wallet.ed25519_seed.cred.${credentialId}`,
    credentialType,
    createdAt: '2026-01-01T00:00:00.000Z',
  }))
  const discardPendingKey = jest.fn(async () => undefined)

  try {
    const result = await claimDualFormatCredential(makeDualOffer(), {
      pendingCredentialKeyId: 'pending-mdoc-fail',
      dependencies: {
        acquireAccessToken: async () => ({
          accessToken: 'shared-token',
          cNonce: 'nonce-1',
        }),
        acquireCredentialRecord: async (offer) => {
          const format = offer.credentialConfigurations[0]?.format
          if (format === 'mso_mdoc') {
            throw new Error('mdoc-issuer-unavailable')
          }
          return sdJwtRecord
        },
        createProofSigningSession: async (credentialKeyId) => ({
          credentialKeyId,
          signProof: async () => 'proof',
          close: jest.fn(),
        }),
        bindPendingCredentialKey: bindPendingKey,
        discardPendingCredentialKey: discardPendingKey,
        storeMdoc: async () => undefined,
        getCredentialStorage: () => credentialStorage,
      },
    })

    expect(result.partial).toBe(true)
    expect(result.missingFormat).toBe('mso_mdoc')
    expect(bindPendingKey).toHaveBeenCalledTimes(1)
    expect(storage.has(`credential:${sdJwtRecord.id}`)).toBe(true)
    expect(discardPendingKey).not.toHaveBeenCalled()
  } finally {
    metaStorage.remove(WALLET_CRYPTO_V2_META_KEY)
  }
})

test('claim cancellation preserves the acquisition-aborted error', async () => {
  const metaStorage = getMetaStorage()
  metaStorage.set(WALLET_CRYPTO_V2_META_KEY, 'true')

  const abortController = new AbortController()
  const discardPendingKey = jest.fn(async () => undefined)
  const acquireRecord = jest.fn(async () => {
    abortController.abort()
    return sdJwtRecord
  })

  try {
    await expect(
      claimDualFormatCredential(makeDualOffer(), {
        signal: abortController.signal,
        dependencies: {
          acquireCredentialRecord: acquireRecord as typeof import('../vci/exchangeService').acquireCredentialRecord,
          createPendingCredentialKey: async () => 'pending-claim-abort-key',
          createProofSigningSession: async (credentialKeyId) => ({
            credentialKeyId,
            signProof: async () => 'proof',
            close: jest.fn(),
          }),
          discardPendingCredentialKey: discardPendingKey,
          acquireAccessToken: async () => ({
            accessToken: 'shared-token',
            cNonce: 'nonce',
          }),
          signProof: async () => 'unused',
          requestCredential: async () => 'unused',
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    ).rejects.toThrow('CredentialAcquisitionAborted')

    expect(discardPendingKey).toHaveBeenCalledWith('pending-claim-abort-key')
    expect(acquireRecord).toHaveBeenCalledTimes(1)
  } finally {
    metaStorage.remove(WALLET_CRYPTO_V2_META_KEY)
  }
})

test('acquireDualFormatForPreview surfaces both format failures when neither can be acquired', async () => {
  await expect(
    acquireDualFormatForPreview(makeDualOffer(), {
      dependencies: {
        acquireAccessToken: async () => ({
          accessToken: 'shared-token',
          cNonce: 'nonce',
        }),
        acquireCredentialRecord: async () => {
          throw new Error('CredentialKeySigningSessionRequired')
        },
        signProof: async () => 'unused',
        requestCredential: async () => 'unused',
        getCredentialStorage: () => ({
          getString: () => undefined,
          set: () => undefined,
        }),
      },
    }),
  ).rejects.toThrow(
    'DualFormatClaimFailed: neither format could be acquired (dc+sd-jwt: CredentialKeySigningSessionRequired; mso_mdoc: CredentialKeySigningSessionRequired)',
  )
})
