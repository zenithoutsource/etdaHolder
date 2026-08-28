import { resolveEffectiveDisclosureKeys } from '../claimDisclosurePolicy'
import { expandDcqlSelectedKeysForSdJwt } from '../dcqlClaimPathKeys'
import { isDualFormatDcqlRequest } from '../dualFormatPresentationMatch'
import { isMsoMdocDcqlFormat } from '../dualFormatQuery'
import { agentDebugLog } from '@/src/services/debug/agentDebugLog'
import { countSdJwtDisclosureSegments } from '../sdJwtSelectiveDisclosure'
import { buildPresentationSubmission, readPresentationTokenAudience, type ResolvedPresentationRequest } from '../presentationService'
import { buildOid4vpMdocVpTokenEntry } from '../oid4vpMdocDeviceResponse'
import { selectSdJwtDisclosures } from '../sdJwtSelectiveDisclosure'
import type { PresentationTokenBuilder } from './types'

function readEffectiveClaimKeys(context: {
  request: ResolvedPresentationRequest
  selectedClaimKeys?: readonly string[]
}): readonly string[] | undefined {
  const { request, selectedClaimKeys } = context
  if (!request.dcqlQuery) return undefined

  const dcqlClaims = request.dcqlQuery.credentials.flatMap((credential) => credential.claims ?? [])

  if (request.dcqlQuery.credentials.every((credential) => isMsoMdocDcqlFormat(credential.format))) {
    if (!selectedClaimKeys) {
      if (dcqlClaims.length === 0) return undefined
      return dcqlClaims
        .filter((claim) => claim.path.length >= 2 && claim.path[0] && claim.path[1])
        .map((claim) => `${claim.path[0]}/${claim.path[1]}`)
    }

    return resolveEffectiveDisclosureKeys(
      request.disclosures.map((disclosure) => ({
        key: disclosure.key,
        mandatory: disclosure.mandatory === true,
        selective: disclosure.selective !== false,
      })),
      new Set(selectedClaimKeys),
    )
  }

  if (!selectedClaimKeys) {
    if (dcqlClaims.length === 0) return undefined
    return expandDcqlSelectedKeysForSdJwt(
      dcqlClaims,
      request.disclosures.map((disclosure) => disclosure.key),
    )
  }

  return expandDcqlSelectedKeysForSdJwt(
    dcqlClaims,
    resolveEffectiveDisclosureKeys(
      request.disclosures.map((disclosure) => ({
        key: disclosure.key,
        mandatory: disclosure.mandatory === true,
        selective: disclosure.selective !== false,
      })),
      new Set(selectedClaimKeys),
    ),
  )
}

export const dualFormatDcqlPresentationBuilder: PresentationTokenBuilder = {
  id: 'dual-format-dcql',
  canBuild: (request) => Boolean(request.dcqlQuery && isDualFormatDcqlRequest(request.dcqlQuery)),
  build: async (context) => {
    const vpToken = await context.buildDualFormatDcqlVpToken(context.request, {
      signSdJwtKb: context.signSdJwtKbPresentationToken,
      selectedClaimKeys: readEffectiveClaimKeys(context),
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
          readEffectiveClaimKeys(context),
          { documentType: context.request.matchedCredential.type },
        ),
      }
    }

    if (mode === 'sd-jwt-kb') {
      const effectiveKeys = readEffectiveClaimKeys(context)
      const sdJwt = selectSdJwtDisclosures(
        context.request.matchedCredential.rawVc,
        effectiveKeys,
        { documentType: context.request.matchedCredential.type },
      )
      // #region agent log
      agentDebugLog({
        location: 'builders.ts:standard-dcql',
        message: 'sdjwt-disclosure-selection',
        hypothesisId: 'H3',
        data: {
          effectiveKeys: effectiveKeys ?? [],
          disclosureCount: countSdJwtDisclosureSegments(sdJwt),
          dcqlClaimPaths: context.request.dcqlQuery?.credentials.flatMap((c) =>
            (c.claims ?? []).map((claim) => claim.path.join('.')),
          ) ?? [],
          credentialType: context.request.matchedCredential.type,
        },
      })
      // #endregion
      const vpToken = await context.signSdJwtKbPresentationToken({
        audience,
        nonce: context.request.nonce,
        sdJwt,
        credentialId: context.request.matchedCredential.id,
        ...(context.request.transactionData ? { transactionData: context.request.transactionData } : {}),
      })
      return { vpToken }
    }

    if (mode === 'mso-mdoc') {
      return {
        vpToken: await buildOid4vpMdocVpTokenEntry({
          request: context.request,
          selectedClaimKeys: readEffectiveClaimKeys(context),
        }),
      }
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
      credentialId: context.request.matchedCredential.id,
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
