import { signSdJwtKbPresentationToken } from '@/src/services/crypto/crypto'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

import type { CompanionTransportPlugin } from '../../types'
import {
  decodeCompanionBeginRequest,
  encodeCompanionCapabilities,
} from './cbor'
import {
  COMPANION_AID_HEX,
  COMPANION_AUD,
  COMPANION_NONCE_BYTES,
  COMPANION_PLUGIN_ID,
} from './constants'

export const companionV1Plugin: CompanionTransportPlugin = {
  id: COMPANION_PLUGIN_ID,
  vendorId: 'reference',
  displayName: 'Companion Transport v1',
  aids: [COMPANION_AID_HEX],
  nonceBytes: COMPANION_NONCE_BYTES,
  encodeCapabilities: encodeCompanionCapabilities,
  decodeBeginRequest: decodeCompanionBeginRequest,
  buildPresentation: async ({ sdJwt, nonceBytes }) => {
    if (nonceBytes.length !== COMPANION_NONCE_BYTES) {
      throw new Error(`CompanionInvalid: nonce must be ${COMPANION_NONCE_BYTES} bytes`)
    }

    return signSdJwtKbPresentationToken({
      sdJwt,
      audience: COMPANION_AUD,
      nonce: base64UrlEncodeBytes(nonceBytes),
    })
  },
}
