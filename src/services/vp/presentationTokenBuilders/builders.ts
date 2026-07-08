import { isDualFormatDcqlRequest } from '../dualFormatPresentationMatch'
import { buildPresentationSubmission, readPresentationTokenAudience, type ResolvedPresentationRequest } from '../presentationService'
import type { PresentationTokenBuilder } from './types'

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
      return { vpToken: context.request.matchedCredential.rawVc }
    }

    if (mode === 'sd-jwt-kb') {
      const vpToken = await context.signSdJwtKbPresentationToken({
        audience,
        nonce: context.request.nonce,
        sdJwt: context.request.matchedCredential.rawVc,
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
