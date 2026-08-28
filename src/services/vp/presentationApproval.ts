import { confirmBiometricGate } from '../auth/biometricGate'
import {
  signPresentationVpToken as defaultSignPresentationVpToken,
  signSdJwtKbPresentationToken as defaultSignSdJwtKbPresentationToken,
} from '../crypto/crypto'
import { canBuildOid4vpMdocDeviceResponse } from './oid4vpMdocDeviceResponse'
import { buildApprovedPresentationResponse } from './presentationTokenBuilders/registry'
import {
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
  buildApprovedPresentationResponse: typeof buildApprovedPresentationResponse
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

/**
 * App-level biometric before submit when no sign-time Keychain/native gate will run.
 * Signed SD-JWT / JWT VP modes sign on approve; mso_mdoc with hardware signs DeviceResponse.
 */
export function requiresPresentationAppBiometric(
  request: ResolvedPresentationRequest,
  options: {
    readTokenMode?: typeof readPresentationTokenMode
    canBuildMdocDeviceResponse?: typeof canBuildOid4vpMdocDeviceResponse
  } = {},
): boolean {
  const readTokenMode = options.readTokenMode ?? readPresentationTokenMode
  const canBuildMdocDeviceResponse = options.canBuildMdocDeviceResponse ?? canBuildOid4vpMdocDeviceResponse
  const tokenMode = readTokenMode(request)
  if (tokenMode === 'raw-credential') return true
  if (tokenMode === 'mso-mdoc') {
    return !canBuildMdocDeviceResponse(request.matchedCredential.id)
  }
  return false
}

export async function createApprovedPresentationResponse(
  request: ResolvedPresentationRequest,
  options: { selectedClaimKeys?: readonly string[] } = {},
  dependencies: Partial<CreateApprovedPresentationResponseDependencies> = {},
): Promise<ApprovedPresentationResponse> {
  const {
    signSdJwtKbPresentationToken = defaultSignSdJwtKbPresentationToken,
    signPresentationVpToken = defaultSignPresentationVpToken,
    buildApprovedPresentationResponse: buildResponse = buildApprovedPresentationResponse,
  } = dependencies

  return buildResponse(request, {
    signSdJwtKbPresentationToken,
    signPresentationVpToken,
    ...(options.selectedClaimKeys ? { selectedClaimKeys: options.selectedClaimKeys } : {}),
  })
}

export { buildApprovedPresentationResponse, registerPresentationTokenBuilder } from './presentationTokenBuilders/registry'
