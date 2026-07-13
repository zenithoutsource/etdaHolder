import {
  HolderRevokeNetworkError,
  HolderRevokeRejectedError,
  HolderRevokeSigningCancelledError,
  submitHolderRevokeRequest,
} from './holderRevokeService'

describe('holderRevokeService', () => {
  test('submitHolderRevokeRequest fetches nonce, signs PoP, and posts revoke', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          nonce: 'nonce-abc',
          audience: 'urn:wallet:dev:issuer:holder-revoke',
          expiresAt: '2026-07-13T12:05:00.000Z',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          status: 'revoked',
          credentialId: 'transcript-1',
          confirmedAt: '2026-07-08T12:00:00.000Z',
        }),
      })

    const signHolderStatusChangePop = jest.fn().mockResolvedValue('pop.jwt.token')

    const result = await submitHolderRevokeRequest('transcript-1', {
      fetchImpl: fetchMock,
      getHolderDid: () => 'did:key:z6Mkholder',
      signHolderStatusChangePop,
    })

    expect(result).toEqual({
      status: 'revoked',
      confirmedAt: '2026-07-08T12:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/wallet-api/dev/issuer/holder-revoke/nonce',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          credentialId: 'transcript-1',
          holderDid: 'did:key:z6Mkholder',
        }),
      }),
    )
    expect(signHolderStatusChangePop).toHaveBeenCalledWith({
      nonce: 'nonce-abc',
      audience: 'urn:wallet:dev:issuer:holder-revoke',
      credentialId: 'transcript-1',
      action: 'revoke',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/wallet-api/dev/issuer/holder-revoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          credentialId: 'transcript-1',
          holderDid: 'did:key:z6Mkholder',
          popJwt: 'pop.jwt.token',
        }),
      }),
    )
  })

  test('submitHolderRevokeRequest throws on issuer rejection', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          nonce: 'nonce-abc',
          audience: 'urn:wallet:dev:issuer:holder-revoke',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'bad' }),
      })

    await expect(
      submitHolderRevokeRequest('transcript-1', {
        fetchImpl: fetchMock,
        getHolderDid: () => 'did:key:z6Mkholder',
        signHolderStatusChangePop: jest.fn().mockResolvedValue('pop.jwt.token'),
      }),
    ).rejects.toBeInstanceOf(HolderRevokeRejectedError)
  })

  test('submitHolderRevokeRequest throws on network failure', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('offline'))

    await expect(
      submitHolderRevokeRequest('transcript-1', {
        fetchImpl: fetchMock,
        getHolderDid: () => 'did:key:z6Mkholder',
        signHolderStatusChangePop: jest.fn(),
      }),
    ).rejects.toBeInstanceOf(HolderRevokeNetworkError)
  })

  test('submitHolderRevokeRequest throws when signing is cancelled', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        nonce: 'nonce-abc',
        audience: 'urn:wallet:dev:issuer:holder-revoke',
      }),
    })

    await expect(
      submitHolderRevokeRequest('transcript-1', {
        fetchImpl: fetchMock,
        getHolderDid: () => 'did:key:z6Mkholder',
        signHolderStatusChangePop: jest
          .fn()
          .mockRejectedValue(new Error('WalletKeySigningCancelled')),
      }),
    ).rejects.toBeInstanceOf(HolderRevokeSigningCancelledError)
  })
})
