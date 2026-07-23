import {
  signPresentationVpToken as defaultSignPresentationVpToken,
  signSdJwtKbPresentationToken as defaultSignSdJwtKbPresentationToken,
} from '../../crypto/crypto'
import { buildDualFormatDcqlVpToken as defaultBuildDualFormatDcqlVpToken } from '../dualFormatVpToken'
import { readPresentationTokenMode, type ResolvedPresentationRequest } from '../presentationService'
import {
  dualFormatDcqlPresentationBuilder,
  presentationExchangeBuilder,
  selectPresentationTokenBuilder,
  standardDcqlPresentationBuilder,
} from './builders'
import type { ApprovedPresentationResponse, PresentationTokenBuildContext, PresentationTokenBuilder } from './types'

const defaultBuilders: PresentationTokenBuilder[] = [
  dualFormatDcqlPresentationBuilder,
  standardDcqlPresentationBuilder,
  presentationExchangeBuilder,
]

export function listPresentationTokenBuilders(): PresentationTokenBuilder[] {
  return [...defaultBuilders]
}

export function registerPresentationTokenBuilder(builder: PresentationTokenBuilder): void {
  if (defaultBuilders.some((existing) => existing.id === builder.id)) {
    throw new Error(`PresentationTokenBuilderDuplicate: ${builder.id}`)
  }
  defaultBuilders.unshift(builder)
}

export async function buildApprovedPresentationResponse(
  request: ResolvedPresentationRequest,
  dependencies: Partial<Pick<PresentationTokenBuildContext, 'signSdJwtKbPresentationToken' | 'signPresentationVpToken' | 'readTokenMode' | 'buildDualFormatDcqlVpToken' | 'selectedClaimKeys'>> = {},
  builders: PresentationTokenBuilder[] = defaultBuilders,
): Promise<ApprovedPresentationResponse> {
  const context: PresentationTokenBuildContext = {
    request,
    ...(dependencies.selectedClaimKeys ? { selectedClaimKeys: dependencies.selectedClaimKeys } : {}),
    signSdJwtKbPresentationToken: dependencies.signSdJwtKbPresentationToken ?? defaultSignSdJwtKbPresentationToken,
    signPresentationVpToken: dependencies.signPresentationVpToken ?? defaultSignPresentationVpToken,
    readTokenMode: dependencies.readTokenMode ?? readPresentationTokenMode,
    buildDualFormatDcqlVpToken: dependencies.buildDualFormatDcqlVpToken ?? defaultBuildDualFormatDcqlVpToken,
  }

  const builder = selectPresentationTokenBuilder(request, builders)
  if (!builder) {
    throw new Error('PresentationRequestUnsupported: no presentation token builder matched this request')
  }

  return builder.build(context)
}
