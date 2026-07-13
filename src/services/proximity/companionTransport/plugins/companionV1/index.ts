import { signSdJwtKbPresentationToken } from '@/src/services/crypto/crypto'
import { base64UrlEncodeBytes } from '@/src/utils/base64Url'

import type { CompanionTransportPlugin } from '../../types'
import {
  decodeEtdaCompanionBeginRequest,
  encodeEtdaCompanionCapabilities,
} from './cbor'
import {
  ETDA_COMPANION_AID_HEX,
  ETDA_COMPANION_AUD,
  ETDA_COMPANION_NONCE_BYTES,
  ETDA_COMPANION_PLUGIN_ID,
} from './constants'

export const etdaCompanionV1Plugin: CompanionTransportPlugin = {
  id: ETDA_COMPANION_PLUGIN_ID,
  vendorId: 'etda',
  displayName: 'ETDA Companion Transport v1',
  aids: [ETDA_COMPANION_AID_HEX],
  nonceBytes: ETDA_COMPANION_NONCE_BYTES,
  encodeCapabilities: encodeEtdaCompanionCapabilities,
  decodeBeginRequest: decodeEtdaCompanionBeginRequest,
  buildPresentation: async ({ sdJwt, nonceBytes }) => {
    if (nonceBytes.length !== ETDA_COMPANION_NONCE_BYTES) {
      throw new Error(`CompanionInvalid: nonce must be ${ETDA_COMPANION_NONCE_BYTES} bytes`)
    }

    return signSdJwtKbPresentationToken({
      sdJwt,
      audience: ETDA_COMPANION_AUD,
      nonce: base64UrlEncodeBytes(nonceBytes),
    })
  },
}
