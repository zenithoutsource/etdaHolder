import NfcManager, { Ndef, NfcError, NfcTech, type NdefRecord, type TagEvent } from 'react-native-nfc-manager'
import { Platform } from 'react-native'

import { isCredentialOfferDeeplink, isSupportedWalletDeeplink } from '../../store/deeplinkStore'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

export type NfcPayloadClassification =
  | { kind: 'credential-offer'; uri: string }
  | { kind: 'oid4vp'; uri: string }

export class NfcUnsupportedError extends Error {
  constructor(message = 'NFC not supported on this device') {
    super(message)
    this.name = 'NfcUnsupportedError'
  }
}

export class NfcDisabledError extends Error {
  constructor(message = 'NFC is disabled') {
    super(message)
    this.name = 'NfcDisabledError'
  }
}

export class NfcReadCancelledError extends Error {
  constructor(message = 'NFC scan cancelled') {
    super(message)
    this.name = 'NfcReadCancelledError'
  }
}

export class NfcUnsupportedTagError extends Error {
  constructor(message = 'Unsupported NFC content') {
    super(message)
    this.name = 'NfcUnsupportedTagError'
  }
}

let initPromise: Promise<void> | null = null

function decodeRecordPayload(record: NdefRecord): string | null {
  const payload = Uint8Array.from(record.payload ?? [])

  try {
    const uri = Ndef.uri.decodePayload(payload)?.trim()
    if (uri) return uri
  } catch {}

  try {
    const text = Ndef.text.decodePayload(payload)?.trim()
    if (text) return text
  } catch {}

  return null
}

function isCancellationError(error: unknown): boolean {
  return error instanceof NfcError.UserCancel || error instanceof NfcError.Timeout
}

export function classifyNfcPayloadUri(uri: string): NfcPayloadClassification {
  const trimmed = uri.trim()

  if (isCredentialOfferDeeplink(trimmed)) {
    return { kind: 'credential-offer', uri: trimmed }
  }

  if (isSupportedWalletDeeplink(trimmed)) {
    return { kind: 'oid4vp', uri: trimmed }
  }

  throw new NfcUnsupportedTagError('Unsupported NFC content')
}

export function readNdefPayloadUri(tag: Pick<TagEvent, 'ndefMessage'> | null): string {
  const records = tag?.ndefMessage ?? []

  for (const record of records) {
    const payload = decodeRecordPayload(record)
    if (payload) {
      return payload
    }
  }

  throw new NfcUnsupportedTagError('Unsupported NFC content')
}

export async function initNfc(): Promise<void> {
  if (Platform.OS === 'web') {
    return
  }

  if (!initPromise) {
    initPromise = (async () => {
      logWalletStep('scan', 'nfc-init-start')
      const isSupported = await NfcManager.isSupported()
      if (!isSupported) {
        throw new NfcUnsupportedError('NFC not supported on this device')
      }
      await NfcManager.start()
      logWalletStep('scan', 'nfc-init-complete')
    })().catch((error) => {
      initPromise = null
      logWalletError('scan', 'nfc-init-failed', error)
      throw error
    })
  }

  return initPromise
}

export async function readSingleNfcPayload(): Promise<NfcPayloadClassification> {
  await initNfc()

  const isEnabled = await NfcManager.isEnabled()
  if (!isEnabled) {
    throw new NfcDisabledError('NFC is disabled')
  }

  logWalletStep('scan', 'nfc-read-start')

  try {
    await NfcManager.requestTechnology(NfcTech.Ndef)
    const tag = await NfcManager.getTag()
    const uri = readNdefPayloadUri(tag)
    const payload = classifyNfcPayloadUri(uri)
    logWalletStep('scan', 'nfc-read-complete', { kind: payload.kind })
    return payload
  } catch (error) {
    if (isCancellationError(error)) {
      logWalletStep('scan', 'nfc-read-cancelled')
      throw new NfcReadCancelledError('NFC scan cancelled')
    }

    logWalletError('scan', 'nfc-read-failed', error)
    throw error
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined)
  }
}

export function resetNfcForTests(): void {
  initPromise = null
}
