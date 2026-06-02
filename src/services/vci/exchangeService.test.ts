import {
  claimCredential,
  resolveOffer,
  syncCredentialToBackend,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from './exchangeService'

const offerUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22credential_configuration_ids%22%3A%5B%22ThaiNationalID%22%5D%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%2C%22tx_code%22%3A%7B%22input_mode%22%3A%22numeric%22%2C%22length%22%3A6%7D%7D%7D%7D'
const missingConfigurationIdsOfferUri =
  'openid-credential-offer://?credential_offer=%7B%22credential_issuer%22%3A%22https%3A%2F%2Fissuer.example.com%22%2C%22grants%22%3A%7B%22urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Apre-authorized_code%22%3A%7B%22pre-authorized_code%22%3A%22mock-preauth-code%22%7D%7D%7D'

async function expectErrorPrefix(operation: () => Promise<unknown>, prefix: string): Promise<void> {
  try {
    await operation()
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(prefix)) {
      return
    }

    throw error
  }

  throw new Error(`Expected ${prefix}`)
}

function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`
}

async function contract(): Promise<ResolvedCredentialOffer> {
  return resolveOffer(offerUri, {
    fetchIssuerMetadata: async () => ({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        ThaiNationalID: {
          format: 'jwt_vc_json',
          credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
          display: [{ name: 'Thai National ID', locale: 'en' }],
        },
      },
      display: [{ name: 'Example Issuer', locale: 'en' }],
    }),
  })
}

void contract()

async function missingCredentialConfigurationIdsContract(): Promise<void> {
  await expectErrorPrefix(
    () =>
      resolveOffer(missingConfigurationIdsOfferUri, {
        fetchIssuerMetadata: async () => ({
          credential_issuer: 'https://issuer.example.com',
          credential_endpoint: 'https://issuer.example.com/credential',
          credential_configurations_supported: {
            ThaiNationalID: {
              format: 'jwt_vc_json',
              credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
            },
          },
        }),
      }),
    'CredentialOfferInvalid',
  )
}

void missingCredentialConfigurationIdsContract()

async function txCodeContract(): Promise<void> {
  const resolved = await contract()

  await expectErrorPrefix(
    () =>
      claimCredential(resolved, {
        dependencies: {
          acquireAccessToken: async () => {
            throw new Error('should not acquire without tx_code')
          },
          requestCredential: async () => 'vc.jwt',
          signProof: async () => 'proof.jwt',
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    'TransactionCodeRequired',
  )
}

void txCodeContract()

async function acquisitionOrchestrationContract(): Promise<void> {
  const resolved = await contract()

  await claimCredential(resolved, {
    tx_code: '123456',
    dependencies: {
      acquireAccessToken: async ({ resolvedOffer, tx_code }) => {
        if (resolvedOffer !== resolved || tx_code !== '123456') {
          throw new Error('access token input mismatch')
        }

        return { accessToken: 'access-token', cNonce: 'nonce' }
      },
      signProof: async (cNonce, issuerUrl) => {
        if (cNonce !== 'nonce' || issuerUrl !== resolved.issuer) {
          throw new Error('proof input mismatch')
        }

        return 'proof.jwt'
      },
      requestCredential: async ({ resolvedOffer, accessToken, proof }) => {
        if (resolvedOffer !== resolved || accessToken !== 'access-token' || proof !== 'proof.jwt') {
          throw new Error('credential request input mismatch')
        }

        return unsignedJwt({
          jti: 'orchestration-vc',
          vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
        })
      },
      getCredentialStorage: () => ({
        getString: () => undefined,
        set: () => undefined,
      }),
    },
  })
}

void acquisitionOrchestrationContract()

async function claimCredentialContract(): Promise<VerifiableCredentialRecord> {
  const resolved = await contract()
  const writes = new Map<string, string>()
  const vc = unsignedJwt({
    jti: 'vc-123',
    iat: 1760000000,
    exp: 1760003600,
    vc: {
      type: ['VerifiableCredential', 'ThaiNationalID'],
      credentialSubject: { givenName: 'Ada' },
    },
  })

  const record = await claimCredential(resolved, {
    tx_code: '123456',
    dependencies: {
      acquireAccessToken: async ({ resolvedOffer, tx_code }) => {
        if (resolvedOffer !== resolved || tx_code !== '123456') {
          throw new Error('access token input mismatch')
        }

        return { accessToken: 'access-token', cNonce: 'nonce-1' }
      },
      signProof: async (nonce, audience) => {
        if (nonce !== 'nonce-1') throw new Error('nonce not passed')
        if (audience !== 'https://issuer.example.com') throw new Error('audience not passed')
        return 'proof.jwt'
      },
      requestCredential: async ({ resolvedOffer, accessToken, proof }) => {
        if (resolvedOffer !== resolved || accessToken !== 'access-token' || proof !== 'proof.jwt') {
          throw new Error('credential request input mismatch')
        }

        return vc
      },
      getCredentialStorage: () => ({
        getString: (key: string) => writes.get(key),
        set: (key: string, value: string) => {
          writes.set(key, value)
        },
      }),
    },
  })

  if (record.id !== 'vc-123') throw new Error('record id mismatch')
  if (record.type !== 'ThaiNationalID') throw new Error('record type mismatch')
  if (record.rawVc !== vc) throw new Error('raw VC mismatch')
  if (record.issuedAt !== '2025-10-09T08:53:20.000Z') throw new Error('issuedAt mismatch')
  if (record.expiresAt !== '2025-10-09T09:53:20.000Z') throw new Error('expiresAt mismatch')
  if (!writes.has('credential:vc-123')) throw new Error('record not stored')
  if (writes.get('credential:index') !== JSON.stringify(['vc-123'])) throw new Error('index not stored')

  return record
}

void claimCredentialContract()

async function unsupportedFlowContract(): Promise<void> {
  const resolved = await contract()
  const withoutPreAuth = { ...resolved, preAuthorizedCode: undefined }

  await expectErrorPrefix(
    () =>
      claimCredential(withoutPreAuth, {
        tx_code: '123456',
        dependencies: {
          acquireAccessToken: async () => {
            throw new Error('should not acquire unsupported flow')
          },
          requestCredential: async () => 'vc.jwt',
          signProof: async () => 'proof.jwt',
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    'CredentialFlowUnsupported',
  )
}

void unsupportedFlowContract()

async function unsupportedFormatContract(): Promise<void> {
  const resolved = await contract()
  const unsupported = {
    ...resolved,
    credentialConfigurations: [
      {
        ...resolved.credentialConfigurations[0],
        format: 'mso_mdoc',
      },
    ],
  }

  await expectErrorPrefix(
    () =>
      claimCredential(unsupported, {
        tx_code: '123456',
        dependencies: {
          acquireAccessToken: async () => {
            throw new Error('should not acquire unsupported format')
          },
          requestCredential: async () => 'vc.jwt',
          signProof: async () => 'proof.jwt',
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    'CredentialFormatUnsupported',
  )
}

void unsupportedFormatContract()

const backendRecord: VerifiableCredentialRecord = {
  id: 'vc-123',
  type: 'ThaiNationalID',
  rawVc: 'signed.vc.jwt',
  claims: {},
  issuedAt: '2025-10-09T08:53:20.000Z',
}

async function backendSyncContract(): Promise<void> {
  const result = await syncCredentialToBackend(backendRecord, {
    walletId: 'wallet-1',
    sessionToken: 'session-token',
    dependencies: {
      getHolderDid: () => 'did:key:zHolder',
      importCredential: async (wallet, data, options) => {
        if (wallet !== 'wallet-1') throw new Error('wallet id mismatch')
        if (data.jwt !== 'signed.vc.jwt') throw new Error('jwt mismatch')
        if (data.associated_did !== 'did:key:zHolder') throw new Error('associated DID mismatch')

        const authorization = options?.headers instanceof Headers
          ? options.headers.get('Authorization')
          : (options?.headers as Record<string, string> | undefined)?.Authorization

        if (authorization !== 'Bearer session-token') throw new Error('authorization mismatch')

        return { data: {}, status: 201, headers: new Headers() }
      },
    },
  })

  if (result.status !== 201) throw new Error('sync status mismatch')
}

void backendSyncContract()

async function backendSyncMissingWalletContract(): Promise<void> {
  await expectErrorPrefix(
    () =>
      syncCredentialToBackend(backendRecord, {
        walletId: '',
        sessionToken: 'session-token',
      }),
    'BackendSyncWalletMissing',
  )
}

void backendSyncMissingWalletContract()

async function backendSyncMissingSessionContract(): Promise<void> {
  await expectErrorPrefix(
    () =>
      syncCredentialToBackend(backendRecord, {
        walletId: 'wallet-1',
        sessionToken: '',
      }),
    'BackendSyncUnauthorized',
  )
}

void backendSyncMissingSessionContract()

async function backendSyncFailureContract(): Promise<void> {
  await expectErrorPrefix(
    () =>
      syncCredentialToBackend(backendRecord, {
        walletId: 'wallet-1',
        sessionToken: 'session-token',
        dependencies: {
          getHolderDid: () => 'did:key:zHolder',
          importCredential: async () => ({ data: undefined, status: 400, headers: new Headers() }),
        },
      }),
    'BackendSyncFailed: HTTP 400',
  )
}

void backendSyncFailureContract()
