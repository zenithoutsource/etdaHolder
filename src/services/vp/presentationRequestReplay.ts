import { sha256 } from '@noble/hashes/sha2.js'

import { logWalletError } from '../debug/walletLogger'

export const PRESENTATION_REPLAY_STORAGE_KEY = 'wallet:oid4vp:replay-fingerprints:v1'

const PRESENTATION_REPLAY_VERSION = 1
const MAX_PRESENTATION_REPLAY_ENTRIES = 128

export type PresentationReplayStorage = {
  getString: (key: string) => string | undefined
  set: (key: string, value: string) => void
}

type PersistedPresentationReplay = {
  version: typeof PRESENTATION_REPLAY_VERSION
  fingerprints: string[]
}

let replayStorage: PresentationReplayStorage | undefined
let consumedFingerprints = new Set<string>()

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fingerprint(kind: 'request-uri' | 'nonce', value: string): string {
  return `${kind}:${toHex(sha256(new TextEncoder().encode(value.trim())))}`
}

function readPersistedFingerprints(storage: PresentationReplayStorage): Set<string> {
  let raw: string | undefined
  try {
    raw = storage.getString(PRESENTATION_REPLAY_STORAGE_KEY)
  } catch (error) {
    logWalletError('oid4vp', 'presentation-replay-ledger-read-failed', error)
    throw new Error('PresentationReplayLedgerReadFailed')
  }
  if (!raw) return new Set<string>()

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedPresentationReplay>
    if (
      parsed.version !== PRESENTATION_REPLAY_VERSION
      || !Array.isArray(parsed.fingerprints)
      || parsed.fingerprints.some((entry) => typeof entry !== 'string')
    ) {
      throw new Error('PresentationReplayLedgerCorrupt')
    }

    return new Set(parsed.fingerprints.slice(-MAX_PRESENTATION_REPLAY_ENTRIES))
  } catch (error) {
    logWalletError('oid4vp', 'presentation-replay-ledger-read-failed', error)
    if (error instanceof Error && error.message === 'PresentationReplayLedgerCorrupt') {
      throw error
    }
    throw new Error('PresentationReplayLedgerCorrupt')
  }
}

function persistReplayFingerprints(): void {
  if (!replayStorage) {
    const error = new Error('PresentationReplayLedgerWriteFailed')
    logWalletError('oid4vp', 'presentation-replay-ledger-write-failed', error)
    throw error
  }

  try {
    const record: PersistedPresentationReplay = {
      version: PRESENTATION_REPLAY_VERSION,
      fingerprints: [...consumedFingerprints].slice(-MAX_PRESENTATION_REPLAY_ENTRIES),
    }
    replayStorage.set(PRESENTATION_REPLAY_STORAGE_KEY, JSON.stringify(record))
  } catch (error) {
    logWalletError('oid4vp', 'presentation-replay-ledger-write-failed', error)
    throw new Error('PresentationReplayLedgerWriteFailed')
  }
}

/**
 * Loads the durable replay ledger after wallet storage is available.
 * Only SHA-256 fingerprints are persisted; request URIs and nonces are not.
 */
export function configurePresentationReplayStorage(storage: PresentationReplayStorage): void {
  replayStorage = storage
  consumedFingerprints = readPersistedFingerprints(storage)
}

export function createWebPresentationReplayStorage(): PresentationReplayStorage {
  return {
    getString: (key) => {
      const storage = globalThis.localStorage
      if (!storage) throw new Error('PresentationReplayWebStorageUnavailable')
      return storage.getItem(key) ?? undefined
    },
    set: (key, value) => {
      const storage = globalThis.localStorage
      if (!storage) throw new Error('PresentationReplayWebStorageUnavailable')
      storage.setItem(key, value)
    },
  }
}

export function isPresentationRequestConsumed(requestUri: string): boolean {
  return consumedFingerprints.has(fingerprint('request-uri', requestUri))
}

export function isPresentationNonceConsumed(nonce: string): boolean {
  return consumedFingerprints.has(fingerprint('nonce', nonce))
}

export function markPresentationRequestConsumed(input: {
  requestUri: string
  nonce?: string
}): void {
  const nextFingerprints = [
    fingerprint('request-uri', input.requestUri),
    ...(input.nonce ? [fingerprint('nonce', input.nonce)] : []),
  ]
  if (nextFingerprints.some((entry) => consumedFingerprints.has(entry))) {
    const replayError = new Error('PresentationRequestReplay')
    logWalletError('oid4vp', 'presentation-replay-reservation-blocked', replayError)
    throw replayError
  }

  const previousFingerprints = consumedFingerprints
  const nextConsumedFingerprints = new Set(consumedFingerprints)
  nextFingerprints.forEach((entry) => nextConsumedFingerprints.add(entry))
  if (nextConsumedFingerprints.size > MAX_PRESENTATION_REPLAY_ENTRIES) {
    consumedFingerprints = new Set(
      [...nextConsumedFingerprints].slice(-MAX_PRESENTATION_REPLAY_ENTRIES),
    )
  } else {
    consumedFingerprints = nextConsumedFingerprints
  }

  try {
    persistReplayFingerprints()
  } catch (error) {
    consumedFingerprints = previousFingerprints
    throw error
  }
}
