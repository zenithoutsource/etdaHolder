import * as credentialSigningKey from '../crypto/credentialSigningKey'
import * as walletCryptoActivation from '../crypto/walletCryptoActivation'
import {
  acquireCredentialRecord,
  claimCredential,
  syncCredentialToBackend,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from './exchangeService'

const mockIsWalletCryptoV2Enabled = jest.fn()
const mockReadCachedWalletAttestations = jest.fn()

jest.mock('./issuerDidWebVerify', () => ({
  assertIssuerDidWebCredentialSignature: jest.fn(async () => undefined),
}))

function resolvedOffer(): ResolvedCredentialOffer {
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
        id: 'ThaiNationalID',
        requestId: 'ThaiNationalID',
        format: 'dc+sd-jwt',
        rawConfiguration: { format: 'dc+sd-jwt' } as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
      },
    ],
    preAuthorizedCode: 'pre-auth',
    supportedFlows: ['pre-authorized_code'],
    version: 10015,
  }
}

function unsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.`
}

describe('per-credential', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsWalletCryptoV2Enabled.mockReturnValue(true)
    mockReadCachedWalletAttestations.mockReturnValue({
      wua: { value: 'wua.jwt.', expiresAt: '2026-07-25T00:00:00.000Z' },
      wia: { value: 'wia.jwt.', expiresAt: '2026-07-25T00:00:00.000Z' },
    })

    jest.spyOn(walletCryptoActivation, 'isWalletCryptoV2Enabled').mockImplementation(() => mockIsWalletCryptoV2Enabled())
    jest
      .spyOn(walletCryptoActivation, 'readCachedWalletAttestations')
      .mockImplementation(() => mockReadCachedWalletAttestations())

    jest.spyOn(credentialSigningKey, 'createPendingCredentialKey').mockResolvedValue('pending-key-1')
    jest.spyOn(credentialSigningKey, 'bindPendingKeyToCredential').mockResolvedValue({
      credentialId: 'vc-123',
      holderDid: 'did:key:z6MkperCredential',
      keychainService: 'wallet.ed25519_seed.cred.vc-123',
      credentialType: 'ThaiNationalID',
      createdAt: '2026-07-24T00:00:00.000Z',
    })
    jest.spyOn(credentialSigningKey, 'discardPendingCredentialKey').mockResolvedValue()
    jest.spyOn(credentialSigningKey, 'getCredentialHolderDid').mockReturnValue('did:key:z6MkperCredential')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('claim flow creates pending key before signProof and binds after acquire', async () => {
    const resolved = resolvedOffer()
    const writes = new Map<string, string>()
    const rawVc = unsignedJwt({
      jti: 'vc-123',
      vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
      iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
    })
    let capturedSignOptions: { credentialKeyId?: string } | undefined
    let capturedWalletAttestations: { wua: string; wia: string } | undefined

    await claimCredential(resolved, {
      tx_code: '123456',
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce-1' }),
        signProof: async (_nonce, _audience, options) => {
          capturedSignOptions = options
          return 'proof.jwt'
        },
        requestCredential: async ({ walletAttestations }) => {
          capturedWalletAttestations = walletAttestations
          return rawVc
        },
        getCredentialStorage: () => ({
          getString: (key: string) => writes.get(key),
          set: (key: string, value: string) => {
            writes.set(key, value)
          },
        }),
      },
    })

    expect(credentialSigningKey.createPendingCredentialKey).toHaveBeenCalledTimes(1)
    expect(capturedSignOptions?.credentialKeyId).toBe('pending-key-1')
    expect(capturedWalletAttestations).toEqual({ wua: 'wua.jwt.', wia: 'wia.jwt.' })
    expect(credentialSigningKey.bindPendingKeyToCredential).toHaveBeenCalledWith(
      'pending-key-1',
      'vc-123',
      'ThaiNationalID',
    )
    expect(writes.has('credential:vc-123')).toBe(true)
  })

  test('acquire reuses the credential key carried by a shared proof session', async () => {
    const resolved = resolvedOffer()
    const rawVc = unsignedJwt({
      jti: 'vc-shared-session',
      vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
      iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
    })
    const sessionSignProof = jest.fn(async (
      _nonce: string,
      _audience: string,
      options?: { credentialKeyId?: string },
    ) => {
      expect(options?.credentialKeyId).toBe('shared-key-1')
      return 'proof.jwt'
    })
    const dependencySignProof = jest.fn(async () => 'dependency-proof.jwt')
    const proofSession = {
      credentialKeyId: 'shared-key-1',
      signProof: sessionSignProof,
      close: jest.fn(),
    }

    const record = await acquireCredentialRecord(resolved, {
      tx_code: '123456',
      proofSession,
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce-1' }),
        signProof: dependencySignProof,
        requestCredential: async () => rawVc,
        getCredentialStorage: () => ({
          getString: () => undefined,
          set: () => undefined,
        }),
      },
    })

    expect(record.id).toBe('vc-shared-session')
    expect(credentialSigningKey.createPendingCredentialKey).not.toHaveBeenCalled()
    expect(credentialSigningKey.bindPendingKeyToCredential).toHaveBeenCalledWith(
      'shared-key-1',
      'vc-shared-session',
      'ThaiNationalID',
    )
    expect(sessionSignProof).toHaveBeenCalledWith(
      'nonce-1',
      resolved.issuer,
      { keyBinding: 'did-kid', credentialKeyId: 'shared-key-1' },
    )
    expect(dependencySignProof).not.toHaveBeenCalled()
  })

  test('acquireCredentialRecord alone creates and binds per-credential key for preview save path', async () => {
    const resolved = resolvedOffer()
    const rawVc = unsignedJwt({
      jti: 'vc-456',
      vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
      iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
    })

    const record = await acquireCredentialRecord(resolved, {
      tx_code: '123456',
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce-1' }),
        signProof: async () => 'proof.jwt',
        requestCredential: async () => rawVc,
        getCredentialStorage: () => ({
          getString: () => undefined,
          set: () => undefined,
        }),
      },
    })

    expect(credentialSigningKey.createPendingCredentialKey).toHaveBeenCalledTimes(1)
    expect(credentialSigningKey.bindPendingKeyToCredential).toHaveBeenCalledWith(
      'pending-key-1',
      'vc-456',
      'ThaiNationalID',
    )
    expect(record.id).toBe('vc-456')
  })

  test('acquisition failure discards a locally created pending key', async () => {
    await expect(
      acquireCredentialRecord(resolvedOffer(), {
        tx_code: '123456',
        dependencies: {
          acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce-1' }),
          signProof: async () => 'proof.jwt',
          requestCredential: async () => {
            throw new Error('issuer unavailable')
          },
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => undefined,
          }),
        },
      }),
    ).rejects.toThrow('issuer unavailable')

    expect(credentialSigningKey.discardPendingCredentialKey).toHaveBeenCalledWith('pending-key-1')
    expect(credentialSigningKey.bindPendingKeyToCredential).not.toHaveBeenCalled()
  })

  test('sync uses per-credential associated_did when v2 is enabled', async () => {
    mockIsWalletCryptoV2Enabled.mockReturnValue(true)
    const record: VerifiableCredentialRecord = {
      id: 'vc-123',
      type: 'ThaiNationalID',
      rawVc: 'signed.vc.jwt',
      claims: {},
      issuedAt: '2025-10-09T08:53:20.000Z',
    }

    await syncCredentialToBackend(record, {
      walletId: 'wallet-1',
      sessionToken: 'session-token',
      dependencies: {
        getHolderDid: () => 'did:key:zGlobal',
        getCredentialHolderDid: (credentialId) => {
          if (credentialId !== 'vc-123') throw new Error('credential id mismatch')
          return 'did:key:z6MkperCredential'
        },
        importCredential: async (_wallet, data) => {
          if (data.associated_did !== 'did:key:z6MkperCredential') {
            throw new Error(`associated DID mismatch: ${data.associated_did}`)
          }
          return { status: 201 }
        },
      },
    })
  })
})
