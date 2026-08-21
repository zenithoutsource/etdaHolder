import { createPkce, PkceCodeChallengeMethod } from '@openid4vc/oauth2'

import { generatePkcePair } from './pkce'

jest.mock('@openid4vc/oauth2', () => {
  const actual = jest.requireActual<typeof import('@openid4vc/oauth2')>('@openid4vc/oauth2')
  return {
    ...actual,
    createPkce: jest.fn(),
  }
})

const mockCreatePkce = createPkce as jest.MockedFunction<typeof createPkce>

describe('generatePkcePair', () => {
  beforeEach(() => {
    mockCreatePkce.mockReset()
  })

  test('delegates PKCE generation to @openid4vc/oauth2 createPkce()', async () => {
    mockCreatePkce.mockResolvedValue({
      codeVerifier: 'verifier-value',
      codeChallenge: 'challenge-value',
      codeChallengeMethod: PkceCodeChallengeMethod.S256,
    })

    await expect(generatePkcePair()).resolves.toEqual({
      codeVerifier: 'verifier-value',
      codeChallenge: 'challenge-value',
      codeChallengeMethod: PkceCodeChallengeMethod.S256,
    })

    expect(mockCreatePkce).toHaveBeenCalledWith({
      callbacks: {
        hash: expect.any(Function),
        generateRandom: expect.any(Function),
      },
    })
  })
})
