import ReactNativeBiometrics from 'react-native-biometrics'

import {
  authenticateWeakBiometric,
  isNativeWeakBiometricAvailable,
} from '../crypto/nativeEddsaSigner'
import {
  signPresentationVpToken as defaultSignPresentationVpToken,
  signSdJwtKbPresentationToken as defaultSignSdJwtKbPresentationToken,
} from '../crypto/crypto'
import { logWalletError, logWalletStep } from '../debug/walletLogger'
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
  try {
    logWalletStep('oid4vp', 'presentation-biometric-start')

    if (isNativeWeakBiometricAvailable()) {
      logWalletStep('oid4vp', 'presentation-biometric-native-weak-start')
      const success = await authenticateWeakBiometric(
        presentationBiometricPromptMessage,
        presentationBiometricCancelText,
      )
      if (!success) {
        throw new Error('PresentationBiometricCancelled')
      }

      logWalletStep('oid4vp', 'presentation-biometric-complete', {
        authenticator: 'android-native-biometric-weak',
      })
      return
    }

    logWalletStep('oid4vp', 'presentation-biometric-rn-fallback-start')
    const biometrics = new ReactNativeBiometrics({ allowDeviceCredentials: false })
    const sensor = await biometrics.isSensorAvailable()
    logWalletStep('oid4vp', 'presentation-biometric-sensor-available', {
      biometryType: sensor.biometryType,
    })
    if (!sensor.available) {
      throw new Error(`PresentationBiometricUnavailable${sensor.error ? `: ${sensor.error}` : ''}`)
    }

    const { success } = await biometrics.simplePrompt({
      promptMessage: presentationBiometricPromptMessage,
      cancelButtonText: presentationBiometricCancelText,
    })

    if (!success) {
      throw new Error('PresentationBiometricCancelled')
    }

    logWalletStep('oid4vp', 'presentation-biometric-complete', {
      authenticator: 'react-native-biometrics',
    })
  } catch (error) {
    logWalletError('oid4vp', 'presentation-biometric-failed', error)
    if (error instanceof Error && error.message.startsWith('PresentationBiometric')) {
      throw error
    }
    throw new Error('PresentationBiometricFailed')
  }
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
