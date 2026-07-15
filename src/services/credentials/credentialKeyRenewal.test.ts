import { getCredentialStorage } from '../storage/storage'
import { blocksCredentialPresentation, readCredentialRenewal } from './credentialKeyRenewal'

jest.mock('../storage/storage', () => ({
  getCredentialStorage: jest.fn(),
}))

const getCredentialStorageMock = getCredentialStorage as jest.Mock

describe('credentialKeyRenewal', () => {
  test('blocks presentation for renewal states except renewed-active', () => {
    expect(
      blocksCredentialPresentation({
        credentialId: 'credential-1',
        state: 'renewal-required',
        previousHolderDid: 'did:key:old',
        updatedAt: '2026-06-25T10:00:00.000Z',
      }),
    ).toBe(true)

    expect(
      blocksCredentialPresentation({
        credentialId: 'credential-2',
        state: 'renewed-active',
        previousHolderDid: 'did:key:old',
        updatedAt: '2026-06-25T11:00:00.000Z',
      }),
    ).toBe(false)
  })

  test('omits a malformed persisted ready offer URI', () => {
    getCredentialStorageMock.mockReturnValue({
      getString: () =>
        JSON.stringify({
          credentialId: 'credential-1',
          previousHolderDid: 'did:key:old',
          readyOfferUri: 42,
          state: 'renewal-processing',
          updatedAt: '2026-07-14T00:00:00.000Z',
        }),
    })

    expect(readCredentialRenewal('credential-1')).toEqual({
      credentialId: 'credential-1',
      previousHolderDid: 'did:key:old',
      state: 'renewal-processing',
      updatedAt: '2026-07-14T00:00:00.000Z',
    })
  })
})
