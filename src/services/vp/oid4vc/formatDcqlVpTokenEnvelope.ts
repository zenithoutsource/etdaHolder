import {
  readVerifierDcqlVpTokenShape,
  type VerifierDcqlVpTokenShape,
} from '@/src/config/runtimeFlags'

import { parseDcqlVpTokenViaOid4vc } from './parseDcqlVpTokenViaOid4vc'

export type DcqlVpTokenEnvelopeInput = {
  entries: Record<string, string>
  shape?: VerifierDcqlVpTokenShape
}

/**
 * Build a DCQL vp_token response envelope and validate it with the oid4vc parser.
 * Wallet-owned shape selection stays env-driven via EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE.
 */
export function formatDcqlVpTokenEnvelope(input: DcqlVpTokenEnvelopeInput): string {
  const shape = input.shape ?? readVerifierDcqlVpTokenShape()
  const entryIds = Object.keys(input.entries)

  if (shape === 'raw') {
    if (entryIds.length !== 1) {
      throw new Error(
        'PresentationSubmissionFailed: raw DCQL vp_token shape requires exactly one credential query entry',
      )
    }

    const token = input.entries[entryIds[0]!]
    if (!token) {
      throw new Error('PresentationSubmissionFailed: raw DCQL vp_token entry is empty')
    }

    return token
  }

  const envelope = Object.fromEntries(
    Object.entries(input.entries).map(([queryId, token]) => [
      queryId,
      shape === 'object_string' ? token : [token],
    ]),
  )

  parseDcqlVpTokenViaOid4vc(envelope)

  return JSON.stringify(envelope)
}
