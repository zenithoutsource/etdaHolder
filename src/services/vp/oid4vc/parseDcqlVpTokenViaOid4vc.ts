import { parseDcqlVpToken, type VpTokenPresentationEntry } from '@openid4vc/openid4vp'

import { toErrorMessage } from '@/src/utils/jwtUtils'

export type ParsedDcqlVpToken = Record<string, readonly [VpTokenPresentationEntry, ...VpTokenPresentationEntry[]]>

/**
 * Parse a DCQL vp_token envelope via @openid4vc/openid4vp.
 * Accepts a JSON string or object keyed by credential query id.
 */
export function parseDcqlVpTokenViaOid4vc(vpToken: unknown): ParsedDcqlVpToken {
  try {
    return parseDcqlVpToken(vpToken)
  } catch (error) {
    throw new Error(`PresentationSubmissionFailed: invalid DCQL vp_token (${toErrorMessage(error)})`)
  }
}
