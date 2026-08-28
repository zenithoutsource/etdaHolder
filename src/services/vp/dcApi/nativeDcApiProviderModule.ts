/**
 * JS bridge for the Android Digital Credentials provider native module.
 */
import { requireNativeModule } from 'expo'
import { Platform } from 'react-native'

import { encodeDcApiRegistryPayloadBase64 } from './dcApiRegistryEncoder'
import type { DcApiPlatformPresentationEvent, DcApiTransport } from './dcApiCrossDevice'

export type DcApiRegistryField = {
  namespace: string
  identifier: string
  fieldValue: string | number | boolean | null
}

export type DcApiRegistryCredential = {
  credentialId: string
  docType: string
  displayName: string
  fields: DcApiRegistryField[]
}

export type DcApiPresentationRequestEvent = DcApiPlatformPresentationEvent

type NativeDcApiProviderModule = {
  syncDcApiRegistryPayload?: (options: { registryPayloadBase64: string }) => Promise<number>
  completeDcApiSession: (sessionId: string, responseJson: string) => Promise<void>
  cancelDcApiSession: (sessionId: string, reason: string) => Promise<void>
  pullPendingDcApiPresentationRequests?: () => Promise<DcApiPresentationRequestEvent[]>
  addListener: <EventName extends 'onDcApiPresentationRequest' | 'onDcApiCrossDeviceSession'>(
    eventName: EventName,
    listener: (event: DcApiPresentationRequestEvent) => void,
  ) => { remove: () => void }
}

let nativeModule: NativeDcApiProviderModule | null | undefined

export function getNativeDcApiProviderModule(): NativeDcApiProviderModule | null {
  if (nativeModule !== undefined) return nativeModule
  if (Platform.OS !== 'android') {
    nativeModule = null
    return nativeModule
  }

  try {
    nativeModule = requireNativeModule<NativeDcApiProviderModule>('ExpoDcApiProvider')
  } catch {
    nativeModule = null
  }
  return nativeModule
}

export function requireNativeDcApiProviderModule(): NativeDcApiProviderModule {
  const module = getNativeDcApiProviderModule()
  if (!module) {
    throw new Error('NativeDcApiProviderModuleRequired: Android DC API provider is unavailable')
  }
  return module
}

export function isNativeDcApiProviderAvailable(): boolean {
  return Boolean(getNativeDcApiProviderModule())
}

export function isDcApiRegistryPayloadSyncAvailable(): boolean {
  const module = getNativeDcApiProviderModule()
  return typeof module?.syncDcApiRegistryPayload === 'function'
}

export async function syncDcApiRegistry(entries: DcApiRegistryCredential[]): Promise<number> {
  const module = getNativeDcApiProviderModule()
  if (!module || entries.length === 0) return 0

  if (!isDcApiRegistryPayloadSyncAvailable()) {
    throw new Error(
      'DcApiRegistryNativeRebuildRequired: rebuild and reinstall the Android dev app after the CMWallet registry update',
    )
  }

  const payloadBase64 = encodeDcApiRegistryPayloadBase64(entries)
  const nativeResult = await module.syncDcApiRegistryPayload!({
    registryPayloadBase64: payloadBase64,
  })
  return nativeResult > 0 ? entries.length : 0
}

export async function completeDcApiSession(sessionId: string, responseJson: string): Promise<void> {
  await requireNativeDcApiProviderModule().completeDcApiSession(sessionId, responseJson)
}

export async function cancelDcApiSession(sessionId: string, reason: string): Promise<void> {
  await requireNativeDcApiProviderModule().cancelDcApiSession(sessionId, reason)
}

export function isDcApiPendingPullAvailable(): boolean {
  const module = getNativeDcApiProviderModule()
  return typeof module?.pullPendingDcApiPresentationRequests === 'function'
}

export async function pullPendingDcApiPresentationRequests(): Promise<DcApiPresentationRequestEvent[]> {
  const module = getNativeDcApiProviderModule()
  if (!module?.pullPendingDcApiPresentationRequests) return []
  const pending = await module.pullPendingDcApiPresentationRequests()
  return Array.isArray(pending) ? pending : []
}

export function subscribeToDcApiPresentationRequests(
  listener: (event: DcApiPresentationRequestEvent) => void,
): () => void {
  const module = getNativeDcApiProviderModule()
  if (!module) return () => undefined
  const subscription = module.addListener('onDcApiPresentationRequest', listener)
  return () => subscription.remove()
}

export function subscribeToDcApiCrossDeviceSessions(
  listener: (event: DcApiPresentationRequestEvent) => void,
): () => void {
  const module = getNativeDcApiProviderModule()
  if (!module) return () => undefined
  const subscription = module.addListener('onDcApiCrossDeviceSession', listener)
  return () => subscription.remove()
}

export type { DcApiTransport }
