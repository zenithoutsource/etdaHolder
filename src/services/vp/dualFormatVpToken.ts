import { readVerifierDcqlVpTokenShape } from '@/src/config/runtimeFlags'
import { signSdJwtKbPresentationToken } from '../crypto/crypto'
import { logWalletStep } from '../debug/walletLogger'
import { readMdocVpTokenEntry } from './mdocVpTokenEntry'
import { isDualFormatDcqlRequest } from './dualFormatPresentationMatch'
import {
  readPresentationTokenAudience,
  type DcqlCredentialQuery,
  type ResolvedPresentationRequest,
} from './presentationService'

export type DualFormatVpTokenDependencies = {
  signSdJwtKb?: typeof signSdJwtKbPresentationToken
  readMdocEntry?: typeof readMdocVpTokenEntry
}

export async function buildDualFormatDcqlVpToken(
  request: ResolvedPresentationRequest,
  dependencies: DualFormatVpTokenDependencies = {},
): Promise<string> {
  if (!request.dcqlQuery || !isDualFormatDcqlRequest(request.dcqlQuery)) {
    throw new Error('PresentationRequestUnsupported: dual-format vp_token assembly requires a dual-format DCQL query')
  }

  const signSdJwtKb = dependencies.signSdJwtKb ?? signSdJwtKbPresentationToken
  const readMdocEntry = dependencies.readMdocEntry ?? readMdocVpTokenEntry
  const shape = readVerifierDcqlVpTokenShape()
  const audience = readPresentationTokenAudience(request)
  const entries: Record<string, string | string[]> = {}

  for (const credentialQuery of request.dcqlQuery.credentials) {
    const token = await buildDcqlCredentialToken({
      request,
      credentialQuery,
      audience,
      signSdJwtKb,
      readMdocEntry,
    })
    entries[credentialQuery.id] = shape === 'object_string' ? token : [token]
  }

  logWalletStep('oid4vp', 'dual-format-vp-token-built', {
    queryIds: Object.keys(entries),
    envelopeBytes: JSON.stringify(entries).length,
  })

  return JSON.stringify(entries)
}

async function buildDcqlCredentialToken(input: {
  request: ResolvedPresentationRequest
  credentialQuery: DcqlCredentialQuery
  audience: string
  signSdJwtKb: typeof signSdJwtKbPresentationToken
  readMdocEntry: typeof readMdocVpTokenEntry
}): Promise<string> {
  const format = input.credentialQuery.format

  if (format === 'dc+sd-jwt' || format === 'vc+sd-jwt') {
    return input.signSdJwtKb({
      audience: input.audience,
      nonce: input.request.nonce,
      sdJwt: input.request.matchedCredential.rawVc,
    })
  }

  if (format === 'mso_mdoc') {
    return input.readMdocEntry(input.request.matchedCredential.id)
  }

  throw new Error(`PresentationCredentialFormatUnsupported: DCQL format ${format ?? 'unknown'} is not supported`)
}

export function isPreformattedDualFormatVpToken(
  request: ResolvedPresentationRequest,
  vpToken: string,
): boolean {
  return Boolean(request.dcqlQuery && isDualFormatDcqlRequest(request.dcqlQuery) && vpToken.trimStart().startsWith('{'))
}
