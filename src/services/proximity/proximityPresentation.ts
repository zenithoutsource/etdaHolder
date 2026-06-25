import { Platform } from 'react-native'

import { logWalletError, logWalletStep } from '../debug/walletLogger'
import { hasStoredMdoc } from './mdocStorage'
import {
  getNativeProximityModule,
  requireNativeProximityModule,
  subscribeToProximityEvents,
  type ProximityAvailability,
} from './nativeProximityModule'

export type ProximityPresentationErrorCode =
  | 'NFC_UNAVAILABLE'
  | 'NFC_DISABLED'
  | 'PROXIMITY_NOT_READY'
  | 'CREDENTIAL_NOT_FOUND'
  | 'PRESENTATION_ACTIVE'
  | 'UNKNOWN'

export class ProximityPresentationError extends Error {
  readonly code: ProximityPresentationErrorCode

  constructor(code: ProximityPresentationErrorCode, message: string) {
    super(message)
    this.name = 'ProximityPresentationError'
    this.code = code
  }
}

export type ProximityPresentationCallbacks = {
  onDeviceEngaged?: () => void
  onRequestReceived?: (requestedFields: string[]) => void
  onPresentationComplete?: (sharedFields: string[]) => void
  onError?: (error: ProximityPresentationError) => void
}

let activeUnsubscribe: (() => void) | null = null

const DEVICE_KEY_ID = 'etda_wallet_signing_key'

function mapNativeError(error: unknown): ProximityPresentationError {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code)
    : 'UNKNOWN'

  const message = error instanceof Error ? error.message : 'Proximity presentation failed'

  switch (code) {
    case 'NFC_UNAVAILABLE':
      return new ProximityPresentationError('NFC_UNAVAILABLE', 'NFC is not supported on this device')
    case 'NFC_DISABLED':
      return new ProximityPresentationError('NFC_DISABLED', 'Please enable NFC in Settings')
    case 'CREDENTIAL_NOT_FOUND':
      return new ProximityPresentationError('CREDENTIAL_NOT_FOUND', 'No credential available for proximity')
    case 'PRESENTATION_ACTIVE':
      return new ProximityPresentationError('PRESENTATION_ACTIVE', 'A proximity presentation is already active')
    case 'PROXIMITY_NOT_READY':
      return new ProximityPresentationError('PROXIMITY_NOT_READY', message)
    default:
      return new ProximityPresentationError('UNKNOWN', message)
  }
}

export function readProximityAvailability(): ProximityAvailability {
  if (Platform.OS !== 'android') {
    return {
      platform: Platform.OS,
      nfcSupported: false,
      nfcEnabled: false,
      identityCredentialSupported: false,
      presentationReady: false,
    }
  }

  const native = getNativeProximityModule()
  if (!native) {
    return {
      platform: 'android',
      nfcSupported: false,
      nfcEnabled: false,
      identityCredentialSupported: false,
      presentationReady: false,
    }
  }

  return native.getAvailability()
}

export function isProximityPresentationSupported(): boolean {
  const availability = readProximityAvailability()
  return availability.nfcSupported && availability.nfcEnabled
}

export async function startProximityPresentation(
  credentialId: string,
  callbacks: ProximityPresentationCallbacks = {},
): Promise<void> {
  if (Platform.OS !== 'android') {
    throw new ProximityPresentationError('PROXIMITY_NOT_READY', 'Proximity presentation is Android-only for now')
  }

  const native = requireNativeProximityModule()
  const hasMdoc = await hasStoredMdoc(credentialId)
  if (!hasMdoc) {
    throw new ProximityPresentationError('CREDENTIAL_NOT_FOUND', 'No credential available for proximity')
  }

  activeUnsubscribe?.()
  activeUnsubscribe = subscribeToProximityEvents({
    onDeviceEngaged: () => {
      logWalletStep('proximity-engagement', 'device engaged')
      callbacks.onDeviceEngaged?.()
    },
    onRequestReceived: (event) => {
      logWalletStep('proximity-engagement', 'request received', { fieldCount: event.requestedFields.length })
      callbacks.onRequestReceived?.(event.requestedFields)
    },
    onPresentationComplete: (event) => {
      logWalletStep('proximity-engagement', 'presentation complete', { fieldCount: event.sharedFields.length })
      callbacks.onPresentationComplete?.(event.sharedFields)
      activeUnsubscribe?.()
      activeUnsubscribe = null
    },
    onError: (event) => {
      logWalletError('proximity-engagement', 'native error', new Error(`${event.code}: ${event.message}`))
      callbacks.onError?.(mapNativeError(event))
      activeUnsubscribe?.()
      activeUnsubscribe = null
    },
  })

  try {
    logWalletStep('proximity-engagement', 'start presentation', { credentialId })
    await native.startProximityPresentation(credentialId, DEVICE_KEY_ID)
  } catch (error) {
    activeUnsubscribe?.()
    activeUnsubscribe = null
    logWalletError('proximity-engagement', 'start failed', error)
    throw mapNativeError(error)
  }
}

export async function approveProximityPresentation(requestedFields: string[]): Promise<void> {
  const native = requireNativeProximityModule()
  try {
    logWalletStep('proximity-consent', 'approve presentation', { fieldCount: requestedFields.length })
    await native.approvePresentation(requestedFields)
  } catch (error) {
    logWalletError('proximity-consent', 'approve failed', error)
    throw mapNativeError(error)
  }
}

export async function denyProximityPresentation(): Promise<void> {
  const native = getNativeProximityModule()
  if (!native) return

  logWalletStep('proximity-consent', 'deny presentation')
  await native.denyPresentation()
  activeUnsubscribe?.()
  activeUnsubscribe = null
}

export async function stopProximityPresentation(): Promise<void> {
  const native = getNativeProximityModule()
  if (!native) return

  logWalletStep('proximity-engagement', 'stop presentation')
  await native.stopProximityPresentation()
  activeUnsubscribe?.()
  activeUnsubscribe = null
}
