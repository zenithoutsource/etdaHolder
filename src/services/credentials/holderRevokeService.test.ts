import {
  HolderRevokeNetworkError,
  HolderRevokeRejectedError,
  submitHolderRevokeRequest,
} from './holderRevokeService'

describe('holderRevokeService', () => {
  test('submitHolderRevokeRequest posts credentialId and holderDid', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        status: 'revoked',
        credentialId: 'transcript-1',
        confirmedAt: '2026-07-08T12:00:00.000Z',
      }),
    })

    const result = await submitHolderRevokeRequest('transcript-1', {
      fetchImpl: fetchMock,
      getHolderDid: () => 'did:key:z6Mkholder',
    })

    expect(result).toEqual({
      status: 'revoked',
      confirmedAt: '2026-07-08T12:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/wallet-api/dev/issuer/holder-revoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          credentialId: 'transcript-1',
          holderDid: 'did:key:z6Mkholder',
        }),
      }),
    )
  })

  test('submitHolderRevokeRequest throws on issuer rejection', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'bad' }),
    })

    await expect(
      submitHolderRevokeRequest('transcript-1', {
        fetchImpl: fetchMock,
        getHolderDid: () => 'did:key:z6Mkholder',
      }),
    ).rejects.toBeInstanceOf(HolderRevokeRejectedError)
  })

  test('submitHolderRevokeRequest throws on network failure', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('offline'))

    await expect(
      submitHolderRevokeRequest('transcript-1', {
        fetchImpl: fetchMock,
        getHolderDid: () => 'did:key:z6Mkholder',
      }),
    ).rejects.toBeInstanceOf(HolderRevokeNetworkError)
  })
})
