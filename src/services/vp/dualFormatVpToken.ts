import { signSdJwtKbPresentationToken } from '../crypto/crypto'
import { logWalletStep } from '../debug/walletLogger'
import { isDualFormatDcqlRequest } from './dualFormatPresentationMatch'
import { isSdJwtDcqlFormat } from './dualFormatQuery'
import { readMdocVpTokenEntry } from './mdocVpTokenEntry'
import { formatDcqlVpTokenEnvelope } from './oid4vc/formatDcqlVpTokenEnvelope'
import { parseDcqlVpTokenViaOid4vc } from './oid4vc/parseDcqlVpTokenViaOid4vc'
import {
  readPresentationTokenAudience,
  type DcqlCredentialQuery,
  type ResolvedPresentationRequest,
} from './presentationService'
import { selectSdJwtDisclosures } from './sdJwtSelectiveDisclosure'

type DualFormatVpTokenDependencies = {
  signSdJwtKb?: typeof signSdJwtKbPresentationToken
  readMdocEntry?: typeof readMdocVpTokenEntry
  selectedClaimKeys?: readonly string[]
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
  const audience = readPresentationTokenAudience(request)
  const entries: Record<string, string> = {}

  for (const credentialQuery of request.dcqlQuery.credentials) {
    entries[credentialQuery.id] = await buildDcqlCredentialToken({
      request,
      credentialQuery,
      audience,
      signSdJwtKb,
      readMdocEntry,
      selectedClaimKeys: dependencies.selectedClaimKeys,
    })
  }

  const formatted = formatDcqlVpTokenEnvelope({ entries })

  logWalletStep('oid4vp', 'dual-format-vp-token-built', {
    queryIds: Object.keys(entries),
    envelopeBytes: formatted.length,
  })

  return formatted
}

async function buildDcqlCredentialToken(input: {
  request: ResolvedPresentationRequest
  credentialQuery: DcqlCredentialQuery
  audience: string
  signSdJwtKb: typeof signSdJwtKbPresentationToken
  readMdocEntry: typeof readMdocVpTokenEntry
  selectedClaimKeys?: readonly string[]
}): Promise<string> {
  const format = input.credentialQuery.format

  if (isSdJwtDcqlFormat(format)) {
    return input.signSdJwtKb({
      audience: input.audience,
      nonce: input.request.nonce,
      sdJwt: selectSdJwtDisclosures(
        input.request.matchedCredential.rawVc,
        readDcqlPresentationClaimKeys(input),
        { documentType: input.request.matchedCredential.type },
      ),
      credentialId: input.request.matchedCredential.id,
      ...(input.request.transactionData ? { transactionData: input.request.transactionData } : {}),
    })
  }

  if (format === 'mso_mdoc') {
    return input.readMdocEntry(input.request.matchedCredential.id, input.request.matchedCredential.rawVc)
  }

  throw new Error(`PresentationCredentialFormatUnsupported: DCQL format ${format ?? 'unknown'} is not supported`)
}

function readDcqlPresentationClaimKeys(input: {
  request: ResolvedPresentationRequest
  credentialQuery: DcqlCredentialQuery
  selectedClaimKeys?: readonly string[]
}): readonly string[] {
  return (
    input.selectedClaimKeys ??
    input.credentialQuery.claims?.flatMap((claim) => (claim.path[0] ? [claim.path[0]] : [])) ??
    input.request.disclosures.map((disclosure) => disclosure.key)
  )
}

export function isPreformattedDualFormatVpToken(
  request: ResolvedPresentationRequest,
  vpToken: string,
): boolean {
  if (!request.dcqlQuery || !isDualFormatDcqlRequest(request.dcqlQuery)) return false
  if (!vpToken.trimStart().startsWith('{')) return false

  try {
    parseDcqlVpTokenViaOid4vc(vpToken)
    return true
  } catch {
    return false
  }
}
