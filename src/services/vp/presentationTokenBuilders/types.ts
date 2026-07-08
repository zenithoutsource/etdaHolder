import type {
  signPresentationVpToken,
  signSdJwtKbPresentationToken,
} from '../../crypto/crypto'
import type { buildDualFormatDcqlVpToken } from '../dualFormatVpToken'
import type { readPresentationTokenMode, ResolvedPresentationRequest } from '../presentationService'

export type ApprovedPresentationResponse = {
  vpToken: string
  presentationSubmission?: import('../presentationService').PresentationSubmission
}

export type PresentationTokenBuildContext = {
  request: ResolvedPresentationRequest
  signSdJwtKbPresentationToken: typeof signSdJwtKbPresentationToken
  signPresentationVpToken: typeof signPresentationVpToken
  readTokenMode: typeof readPresentationTokenMode
  buildDualFormatDcqlVpToken: typeof buildDualFormatDcqlVpToken
}

export type PresentationTokenBuilder = {
  id: string
  canBuild: (request: ResolvedPresentationRequest) => boolean
  build: (context: PresentationTokenBuildContext) => Promise<ApprovedPresentationResponse>
}
