import { isDualFormatDcqlRequest } from '../dualFormatPresentationMatch'
import { buildPresentationSubmission, readPresentationTokenAudience, type ResolvedPresentationRequest } from '../presentationService'
import { selectSdJwtDisclosures } from '../sdJwtSelectiveDisclosure'
import type { PresentationTokenBuilder } from './types'

function readRequestedClaimKeys(request: ResolvedPresentationRequest): readonly string[] | undefined {
  const claims = request.dcqlQuery?.credentials.flatMap((credential) => credential.claims ?? []) ?? []
  if (claims.length === 0) return undefined

  return request.disclosures.map((disclosure) => disclosure.key)
}

export const dualFormatDcqlPresentationBuilder: PresentationTokenBuilder = {
  id: 'dual-format-dcql',
  canBuild: (request) => Boolean(request.dcqlQuery && isDualFormatDcqlRequest(request.dcqlQuery)),
  build: async (context) => {
    const vpToken = await context.buildDualFormatDcqlVpToken(context.request, {
      signSdJwtKb: context.signSdJwtKbPresentationToken,
    })
    return { vpToken }
  },
}

export const standardDcqlPresentationBuilder: PresentationTokenBuilder = {
  id: 'standard-dcql',
  canBuild: (request) => Boolean(request.dcqlQuery && !isDualFormatDcqlRequest(request.dcqlQuery)),
  build: async (context) => {
    const mode = context.readTokenMode(context.request)
    const audience = readPresentationTokenAudience(context.request)

    if (mode === 'raw-credential') {
      return {
        vpToken: selectSdJwtDisclosures(
          context.request.matchedCredential.rawVc,
          readRequestedClaimKeys(context.request),
        ),
      }
    }

    if (mode === 'sd-jwt-kb') {
      const vpToken = await context.signSdJwtKbPresentationToken({
        audience,
        nonce: context.request.nonce,
        sdJwt: selectSdJwtDisclosures(
          context.request.matchedCredential.rawVc,
          readRequestedClaimKeys(context.request),
        ),
      })
      return { vpToken }
    }

    throw new Error('PresentationRequestUnsupported: unsupported DCQL token mode')
  },
}

export const presentationExchangeBuilder: PresentationTokenBuilder = {
  id: 'presentation-exchange',
  canBuild: (request) => Boolean(request.presentationDefinition),
  build: async (context) => {
    const audience = readPresentationTokenAudience(context.request)
    const vpToken = await context.signPresentationVpToken({
      audience,
      nonce: context.request.nonce,
      verifiableCredential: context.request.matchedCredential.rawVc,
    })
    return {
      vpToken,
      presentationSubmission: buildPresentationSubmission(context.request),
    }
  },
}

export function selectPresentationTokenBuilder(
  request: ResolvedPresentationRequest,
  builders: PresentationTokenBuilder[],
): PresentationTokenBuilder | undefined {
  return builders.find((builder) => builder.canBuild(request))
}
