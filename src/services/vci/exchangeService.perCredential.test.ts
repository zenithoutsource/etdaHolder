import * as credentialSigningKey from '../crypto/credentialSigningKey'
import * as hardwareCredentialSigningKey from '../crypto/hardwareCredentialSigningKey'
import * as walletCryptoActivation from '../crypto/walletCryptoActivation'
import * as credentialKeyRegistry from '../crypto/credentialKeyRegistry'
import * as storedCredentials from '../credentials/storedCredentials'
import {
  acquireCredentialRecord,
  claimCredential,
  syncCredentialToBackend,
  type ResolvedCredentialOffer,
  type VerifiableCredentialRecord,
} from './exchangeService'
import { makeTestOid4vcContext } from './testFixtures'

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
    protocolPath: 'oid4vc',
    oid4vcContext: makeTestOid4vcContext(),
  }
}

function unsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${header}.${body}.`
}

describe('per-credential', () => {
  const originalCredentialAttestationsEnv = process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED = 'true'
    mockIsWalletCryptoV2Enabled.mockReturnValue(true)
    mockReadCachedWalletAttestations.mockReturnValue({
      wua: { value: 'wua.jwt.', expiresAt: '2026-07-25T00:00:00.000Z' },
      wia: { value: 'wia.jwt.', expiresAt: '2026-07-25T00:00:00.000Z' },
    })

    jest.spyOn(walletCryptoActivation, 'isWalletCryptoV2Enabled').mockImplementation(() => mockIsWalletCryptoV2Enabled())
    jest
      .spyOn(walletCryptoActivation, 'readCachedWalletAttestations')
      .mockImplementation(() => mockReadCachedWalletAttestations())
    jest.spyOn(walletCryptoActivation, 'activateWalletCryptoV2').mockResolvedValue()

    jest.spyOn(credentialSigningKey, 'createPendingCredentialKey').mockResolvedValue('pending-key-1')
    jest.spyOn(credentialSigningKey, 'bindPendingKeyToCredential').mockResolvedValue({
      credentialId: 'vc-123',
      holderDid: 'did:key:z6MkperCredential',
      keychainService: 'wallet.ed25519_seed.cred.vc-123',
      credentialType: 'ThaiNationalID',
      createdAt: '2026-07-24T00:00:00.000Z',
    })
    jest.spyOn(credentialSigningKey, 'discardPendingCredentialKey').mockResolvedValue()
    jest.spyOn(credentialSigningKey, 'destroyCredentialKey').mockResolvedValue()
    jest.spyOn(credentialSigningKey, 'getCredentialHolderDid').mockReturnValue('did:key:z6MkperCredential')
  })

  afterEach(() => {
    jest.restoreAllMocks()
    if (originalCredentialAttestationsEnv === undefined) {
      delete process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
    } else {
      process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED = originalCredentialAttestationsEnv
    }
  })

  test('does not attach wallet attestations on credential request by default', async () => {
    delete process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
    const resolved = resolvedOffer()
    let capturedWalletAttestations: { wua: string; wia: string } | undefined

    await claimCredential(resolved, {
      tx_code: '123456',
      dependencies: {
        acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce-1' }),
        signProof: async () => 'proof.jwt',
        requestCredential: async ({ walletAttestations }) => {
          capturedWalletAttestations = walletAttestations
          return unsignedJwt({
            jti: 'vc-123',
            vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
            iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
          })
        },
        getCredentialStorage: () => ({
          getString: () => undefined,
          set: () => undefined,
        }),
      },
    })

    expect(capturedWalletAttestations).toBeUndefined()
  })

  test('claim flow creates pending k_cred when Wallet Provider v2 flag is off', async () => {
    mockIsWalletCryptoV2Enabled.mockReturnValue(false)
    delete process.env.EXPO_PUBLIC_OID4VC_CREDENTIAL_WALLET_ATTESTATIONS_ENABLED
    const resolved = resolvedOffer()
    let capturedSignOptions: { credentialKeyId?: string } | undefined
    let capturedWalletAttestations: { wua: string; wia: string } | undefined
    const writes = new Map<string, string>()
    const rawVc = unsignedJwt({
      jti: 'vc-123',
      vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
      iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
    })

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
    expect(capturedWalletAttestations).toBeUndefined()
    expect(credentialSigningKey.bindPendingKeyToCredential).toHaveBeenCalledWith(
      'pending-key-1',
      'vc-123',
      'ThaiNationalID',
    )
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
      { keyBinding: 'jwk', credentialKeyId: 'shared-key-1' },
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

  test('claimCredential destroys bound key when MMKV save fails after bind', async () => {
    const resolved = resolvedOffer()
    const rawVc = unsignedJwt({
      jti: 'vc-save-fail',
      vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
      iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
    })

    await expect(
      claimCredential(resolved, {
        tx_code: '123456',
        dependencies: {
          acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce-1' }),
          signProof: async () => 'proof.jwt',
          requestCredential: async () => rawVc,
          getCredentialStorage: () => ({
            getString: () => undefined,
            set: () => {
              throw new Error('mmkv-write-failed')
            },
          }),
        },
      }),
    ).rejects.toThrow('mmkv-write-failed')

    expect(credentialSigningKey.bindPendingKeyToCredential).toHaveBeenCalledWith(
      'pending-key-1',
      'vc-save-fail',
      'ThaiNationalID',
    )
    expect(credentialSigningKey.destroyCredentialKey).toHaveBeenCalledWith('vc-save-fail')
  })

  test('sync uses per-credential associated_did when a k_cred registry row exists', async () => {
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

  describe('hardware P-256 pending key path', () => {
    const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

    beforeEach(() => {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
      mockIsWalletCryptoV2Enabled.mockReturnValue(false)

      jest.spyOn(hardwareCredentialSigningKey, 'createPendingHardwareCredentialKey').mockResolvedValue('pending-hw-key-1')
      jest.spyOn(hardwareCredentialSigningKey, 'bindPendingHardwareKeyToCredential').mockResolvedValue({
        credentialId: 'vc-hw-123',
        holderDid: 'did:key:z6MkHardwareCredential',
        alias: 'wallet.cred.pending.pending-hw-key-1',
        credentialType: 'ThaiNationalID',
        createdAt: '2026-07-24T00:00:00.000Z',
        securityLevelHint: 'STRONGBOX',
      })
      jest.spyOn(hardwareCredentialSigningKey, 'discardPendingHardwareCredentialKey').mockResolvedValue()
      jest.spyOn(hardwareCredentialSigningKey, 'destroyHardwareCredentialKey').mockResolvedValue()
    })

    afterEach(() => {
      if (originalHardwareFlag === undefined) {
        delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
      } else {
        process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
      }
    })

    test('claimCredential creates and binds hardware pending key when hardware flag is on', async () => {
      const resolved = resolvedOffer()
      const rawVc = unsignedJwt({
        jti: 'vc-hw-123',
        vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
        iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
      })

      await claimCredential(resolved, {
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

      expect(hardwareCredentialSigningKey.createPendingHardwareCredentialKey).toHaveBeenCalledTimes(1)
      expect(credentialSigningKey.createPendingCredentialKey).not.toHaveBeenCalled()
      expect(hardwareCredentialSigningKey.bindPendingHardwareKeyToCredential).toHaveBeenCalledWith(
        'pending-hw-key-1',
        'vc-hw-123',
        'ThaiNationalID',
      )
      expect(credentialSigningKey.bindPendingKeyToCredential).not.toHaveBeenCalled()
    })

    test('claimCredential reuses a supplied pending hardware key instead of minting another', async () => {
      const resolved = resolvedOffer()
      const rawVc = unsignedJwt({
        jti: 'vc-hw-reuse',
        vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
        iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
      })

      await claimCredential(resolved, {
        tx_code: '123456',
        pendingCredentialKeyId: 'pending-reuse-1',
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

      expect(hardwareCredentialSigningKey.createPendingHardwareCredentialKey).not.toHaveBeenCalled()
      expect(hardwareCredentialSigningKey.bindPendingHardwareKeyToCredential).toHaveBeenCalledWith(
        'pending-reuse-1',
        'vc-hw-reuse',
        'ThaiNationalID',
      )
    })

    test('claimCredential destroys the hardware key when MMKV save fails after bind', async () => {
      jest.spyOn(hardwareCredentialSigningKey, 'discardHardwareCredentialKeyReplacement').mockResolvedValue(false)
      jest.spyOn(hardwareCredentialSigningKey, 'hasHardwareCredentialKey').mockImplementation(
        (keyId) => keyId === 'vc-hw-save-fail',
      )
      const resolved = resolvedOffer()
      const rawVc = unsignedJwt({
        jti: 'vc-hw-save-fail',
        vc: { type: ['VerifiableCredential', 'ThaiNationalID'] },
        iat: Math.floor(new Date('2025-10-09T08:53:20.000Z').getTime() / 1000),
      })

      await expect(
        claimCredential(resolved, {
          tx_code: '123456',
          dependencies: {
            acquireAccessToken: async () => ({ accessToken: 'access-token', cNonce: 'nonce-1' }),
            signProof: async () => 'proof.jwt',
            requestCredential: async () => rawVc,
            getCredentialStorage: () => ({
              getString: () => undefined,
              set: () => {
                throw new Error('mmkv-write-failed')
              },
            }),
          },
        }),
      ).rejects.toThrow('mmkv-write-failed')

      expect(hardwareCredentialSigningKey.destroyHardwareCredentialKey).toHaveBeenCalledWith('vc-hw-save-fail')
      expect(credentialSigningKey.destroyCredentialKey).not.toHaveBeenCalled()
    })
  })

  describe('hardware P-256 PID-first cutover gate', () => {
    const originalHardwareFlag = process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED

    function drivingLicenceOffer(): ResolvedCredentialOffer {
      const offer = resolvedOffer()
      return {
        ...offer,
        credentialConfigurations: [
          {
            id: 'DLTDrivingLicence',
            requestId: 'DLTDrivingLicence',
            format: 'dc+sd-jwt',
            rawConfiguration: { format: 'dc+sd-jwt' } as ResolvedCredentialOffer['credentialConfigurations'][number]['rawConfiguration'],
          },
        ],
      }
    }

    beforeEach(() => {
      process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = 'true'
      jest.spyOn(credentialKeyRegistry, 'listCredentialKeyRecords').mockReturnValue([
        {
          credentialId: 'vc-ed25519-pid',
          holderDid: 'did:key:z6Mklegacy',
          keychainService: 'wallet.ed25519_seed.cred.vc-ed25519-pid',
          credentialType: 'ThaiNationalID',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ])
      jest.spyOn(storedCredentials, 'readStoredCredentials').mockReturnValue([
        {
          id: 'vc-ed25519-pid',
          type: 'ThaiNationalID',
          rawVc: 'vc',
          claims: {},
          issuedAt: '2026-01-01T00:00:00.000Z',
        },
      ])
      jest.spyOn(hardwareCredentialSigningKey, 'hasHardwareCredentialKey').mockReturnValue(false)
      jest.spyOn(hardwareCredentialSigningKey, 'createPendingHardwareCredentialKey').mockResolvedValue('pending-hw-cutover')
      jest.spyOn(hardwareCredentialSigningKey, 'discardPendingHardwareCredentialKey').mockResolvedValue()
    })

    afterEach(() => {
      if (originalHardwareFlag === undefined) {
        delete process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED
      } else {
        process.env.EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED = originalHardwareFlag
      }
    })

    test('acquireCredentialRecord blocks driving-licence offers until a hardware PID exists', async () => {
      const acquireAccessToken = jest.fn()

      await expect(
        acquireCredentialRecord(drivingLicenceOffer(), {
          dependencies: {
            acquireAccessToken,
            signProof: async () => 'proof.jwt',
            requestCredential: async () => 'unused',
            getCredentialStorage: () => ({
              getString: () => undefined,
              set: () => undefined,
            }),
          },
        }),
      ).rejects.toThrow('Reissue your national ID')

      expect(acquireAccessToken).not.toHaveBeenCalled()
      expect(hardwareCredentialSigningKey.createPendingHardwareCredentialKey).not.toHaveBeenCalled()
    })

    test('claimCredential blocks driving-licence offers before opening an issuance session', async () => {
      const acquireAccessToken = jest.fn()

      await expect(
        claimCredential(drivingLicenceOffer(), {
          dependencies: {
            acquireAccessToken,
            signProof: async () => 'proof.jwt',
            requestCredential: async () => 'unused',
            getCredentialStorage: () => ({
              getString: () => undefined,
              set: () => undefined,
            }),
          },
        }),
      ).rejects.toThrow('Reissue your national ID')

      expect(acquireAccessToken).not.toHaveBeenCalled()
      expect(hardwareCredentialSigningKey.createPendingHardwareCredentialKey).not.toHaveBeenCalled()
    })

    test('acquireCredentialRecord still reaches token exchange for PID offers during cutover', async () => {
      await expect(
        acquireCredentialRecord(resolvedOffer(), {
          dependencies: {
            acquireAccessToken: async () => {
              throw new Error('token-reached')
            },
            signProof: async () => 'proof.jwt',
            requestCredential: async () => 'unused',
            getCredentialStorage: () => ({
              getString: () => undefined,
              set: () => undefined,
            }),
          },
        }),
      ).rejects.toThrow('token-reached')
    })
  })
})
