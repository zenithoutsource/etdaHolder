import { confirmBiometricGate } from '../auth/biometricGate'
import {
  signPresentationVpToken as defaultSignPresentationVpToken,
  signSdJwtKbPresentationToken as defaultSignSdJwtKbPresentationToken,
} from '../crypto/crypto'
import {
  buildPresentationSubmission,
  readPresentationTokenAudience,
  readPresentationTokenMode,
  type PresentationSubmission,
  type ResolvedPresentationRequest,
} from './presentationService'

type ApprovedPresentationResponse = {
  vpToken: string
  presentationSubmission?: PresentationSubmission
}

type CreateApprovedPresentationResponseDependencies = {
  confirmBiometric: () => Promise<void>
  signSdJwtKbPresentationToken: typeof defaultSignSdJwtKbPresentationToken
  signPresentationVpToken: typeof defaultSignPresentationVpToken
  readTokenMode: typeof readPresentationTokenMode
}

const presentationBiometricPromptMessage = '\u0e22\u0e37\u0e19\u0e22\u0e31\u0e19\u0e15\u0e31\u0e27\u0e15\u0e19\u0e14\u0e49\u0e27\u0e22 Biometric'
const presentationBiometricCancelText = '\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01'

export async function confirmPresentationBiometric(): Promise<void> {
  await confirmBiometricGate({
    promptMessage: presentationBiometricPromptMessage,
    cancelButtonText: presentationBiometricCancelText,
    logScope: 'oid4vp',
    errorPrefix: 'PresentationBiometric',
  })
}

export async function createApprovedPresentationResponse(
  request: ResolvedPresentationRequest,
  dependencies: Partial<CreateApprovedPresentationResponseDependencies> = {},
): Promise<ApprovedPresentationResponse> {
  const {
    signSdJwtKbPresentationToken = defaultSignSdJwtKbPresentationToken,
    signPresentationVpToken = defaultSignPresentationVpToken,
    readTokenMode = readPresentationTokenMode,
  } = dependencies

  const presentationTokenMode = readTokenMode(request)
  const audience = readPresentationTokenAudience(request)
  const presentationSubmission = request.presentationDefinition ? buildPresentationSubmission(request) : undefined

  if (presentationTokenMode === 'raw-credential') {
    return {
      vpToken: request.matchedCredential.rawVc,
      ...(presentationSubmission ? { presentationSubmission } : {}),
    }
  }

  if (presentationTokenMode === 'sd-jwt-kb') {
    const vpToken = await signSdJwtKbPresentationToken({
      audience,
      nonce: request.nonce,
      sdJwt: request.matchedCredential.rawVc,
    })
    return {
      vpToken,
      ...(presentationSubmission ? { presentationSubmission } : {}),
    }
  }

  const vpToken = await signPresentationVpToken({
    audience,
    nonce: request.nonce,
    verifiableCredential: request.matchedCredential.rawVc,
  })
  return {
    vpToken,
    ...(presentationSubmission ? { presentationSubmission } : {}),
  }
}
