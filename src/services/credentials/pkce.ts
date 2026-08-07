import { createPkce, type CreatePkceReturn } from '@openid4vc/oauth2'

import { createOid4vcCallbacks } from '@/src/services/oid4vc/oid4vcCallbacks'

export type PkcePair = {
  codeVerifier: string
  codeChallenge: string
  codeChallengeMethod: CreatePkceReturn['codeChallengeMethod']
}

export async function generatePkcePair(): Promise<PkcePair> {
  const callbacks = createOid4vcCallbacks()
  const pkce = await createPkce({
    callbacks: {
      hash: callbacks.hash,
      generateRandom: callbacks.generateRandom,
    },
  })

  return {
    codeVerifier: pkce.codeVerifier,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: pkce.codeChallengeMethod,
  }
}
