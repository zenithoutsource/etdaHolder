import { blocksCredentialPresentation } from './credentialKeyRenewal'

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
})
