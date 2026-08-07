import { Openid4vciClient } from '@openid4vc/openid4vci'
import type { CallbackContext } from '@openid4vc/oauth2'

import { createOid4vcCallbacks } from '@/src/services/oid4vc/oid4vcCallbacks'

export function createOid4vcVciClient(options?: {
  fetchImpl?: typeof fetch
  signJwtImpl?: CallbackContext['signJwt']
}): Openid4vciClient {
  return new Openid4vciClient({
    callbacks: createOid4vcCallbacks({
      fetchImpl: options?.fetchImpl,
      mode: 'vci',
      signJwtImpl: options?.signJwtImpl,
    }),
  })
}
