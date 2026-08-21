import { signSdJwtKbPresentationToken } from '@/src/services/crypto/crypto'

import { companionV1Plugin } from './index'
import { COMPANION_AUD, COMPANION_NONCE_BYTES } from './constants'

jest.mock('@/src/services/crypto/crypto', () => ({
  signSdJwtKbPresentationToken: jest.fn(async () => 'sdjwt~kb'),
}))

const signKbMock = signSdJwtKbPresentationToken as jest.MockedFunction<typeof signSdJwtKbPresentationToken>

describe('companionV1Plugin.buildPresentation', () => {
  test('signs the KB-JWT with the selected credential id', async () => {
    const nonceBytes = new Uint8Array(COMPANION_NONCE_BYTES).fill(7)

    await companionV1Plugin.buildPresentation({
      sdJwt: 'header.payload.signature',
      nonceBytes,
      credentialId: 'cred-companion-1',
    })

    expect(signKbMock).toHaveBeenCalledWith({
      sdJwt: 'header.payload.signature',
      audience: COMPANION_AUD,
      nonce: expect.any(String),
      credentialId: 'cred-companion-1',
    })
  })
})
