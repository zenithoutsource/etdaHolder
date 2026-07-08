import { requireNativeModule } from 'expo'
import { Platform } from 'react-native'

import type { ReaderSharingMode } from '@/src/config/readerProfiles'

export type ProximityAvailability = {
  platform: string
  sdkInt?: number
  nfcSupported: boolean
  nfcEnabled: boolean
  presentationReady: boolean
}

export type ProximityNativeEvents = {
  onDeviceEngaged: { sessionId?: string }
  onRequestReceived: { requestedFields: string[] }
  onPresentationComplete: { sharedFields: string[] }
  onCompanionSignRequested: { nonceBase64Url: string }
  onError: { code: string; message: string }
}

export type ProximityArmConfig = {
  credentialId: string
  sharingMode: ReaderSharingMode
  profileId: string
  approvedMdocFields: string[]
  companionTransportPluginId?: string
  companionSdJwt?: string
  armWindowMs: number
}

type NativeProximityModule = {
  getAvailability: () => ProximityAvailability
  storeMdoc: (credentialId: string, docType: string, mdocBytes: Uint8Array) => Promise<void>
  hasMdoc: (credentialId: string) => Promise<boolean>
  readMdoc: (credentialId: string) => Promise<Uint8Array>
  deleteMdoc: (credentialId: string) => Promise<void>
  armProximitySession: (config: ProximityArmConfig) => Promise<void>
  supplyCompanionPresentation: (presentation: string) => Promise<void>
  startProximityPresentation: (credentialId: string, deviceKeyId: string) => Promise<void>
  stopProximityPresentation: () => Promise<void>
  approvePresentation: (requestedFields: string[]) => Promise<void>
  denyPresentation: () => Promise<void>
  addListener: <EventName extends keyof ProximityNativeEvents>(
    eventName: EventName,
    listener: (event: ProximityNativeEvents[EventName]) => void,
  ) => { remove: () => void }
}

let nativeModule: NativeProximityModule | null | undefined

export function getNativeProximityModule(): NativeProximityModule | null {
  if (nativeModule !== undefined) return nativeModule

  if (Platform.OS !== 'android') {
    nativeModule = null
    return nativeModule
  }

  try {
    nativeModule = requireNativeModule<NativeProximityModule>('ExpoMdocProximity')
  } catch {
    nativeModule = null
  }

  return nativeModule
}

export function requireNativeProximityModule(): NativeProximityModule {
  const module = getNativeProximityModule()
  if (!module) {
    throw new Error('NativeProximityModuleRequired: Android proximity module is unavailable')
  }
  return module
}

export function isNativeProximityModuleAvailable(): boolean {
  return Boolean(getNativeProximityModule())
}

export function subscribeToProximityEvents(
  handlers: {
    onDeviceEngaged?: (event: ProximityNativeEvents['onDeviceEngaged']) => void
    onRequestReceived?: (event: ProximityNativeEvents['onRequestReceived']) => void
    onPresentationComplete?: (event: ProximityNativeEvents['onPresentationComplete']) => void
    onCompanionSignRequested?: (event: ProximityNativeEvents['onCompanionSignRequested']) => void
    onError?: (event: ProximityNativeEvents['onError']) => void
  },
): () => void {
  const module = getNativeProximityModule()
  if (!module) return () => undefined

  const subscriptions = [
    handlers.onDeviceEngaged ? module.addListener('onDeviceEngaged', handlers.onDeviceEngaged) : null,
    handlers.onRequestReceived ? module.addListener('onRequestReceived', handlers.onRequestReceived) : null,
    handlers.onPresentationComplete
      ? module.addListener('onPresentationComplete', handlers.onPresentationComplete)
      : null,
    handlers.onCompanionSignRequested
      ? module.addListener('onCompanionSignRequested', handlers.onCompanionSignRequested)
      : null,
    handlers.onError ? module.addListener('onError', handlers.onError) : null,
  ].filter((subscription): subscription is { remove: () => void } => subscription !== null)

  return () => {
    for (const subscription of subscriptions) {
      subscription.remove()
    }
  }
}
