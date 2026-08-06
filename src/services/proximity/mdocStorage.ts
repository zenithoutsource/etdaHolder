import { logWalletError, logWalletStep } from '../debug/walletLogger'
import {
  getNativeProximityModule,
  requireNativeProximityModule,
} from './nativeProximityModule'

export type StoredMdocRecord = {
  credentialId: string
  docType: string
}

export async function storeMdocCredential(record: StoredMdocRecord, mdocBytes: Uint8Array): Promise<void> {
  const native = requireNativeProximityModule()
  logWalletStep('proximity-storage', 'store mdoc', { credentialId: record.credentialId, docType: record.docType })
  try {
    await native.storeMdoc(record.credentialId, record.docType, mdocBytes)
  } catch (error) {
    logWalletError('proximity-storage', 'store failed', error)
    throw new Error('ProximityStorageFailed')
  }
}

/**
 * Returns `undefined` when native storage cannot establish presence.
 * Callers must not treat that state as absence during destructive rollback.
 */
export async function hasStoredMdoc(credentialId: string): Promise<boolean | undefined> {
  const native = getNativeProximityModule()
  if (!native) {
    logWalletError(
      'proximity-storage',
      'hasMdoc unavailable',
      new Error('NativeProximityModuleUnavailable'),
      { credentialId },
    )
    return undefined
  }

  try {
    return await native.hasMdoc(credentialId)
  } catch (error) {
    logWalletError('proximity-storage', 'hasMdoc failed', error)
    return undefined
  }
}

export async function deleteStoredMdoc(credentialId: string): Promise<void> {
  const native = getNativeProximityModule()
  if (!native) return

  try {
    await native.deleteMdoc(credentialId)
    logWalletStep('proximity-storage', 'deleted mdoc', { credentialId })
  } catch (error) {
    logWalletError('proximity-storage', 'delete failed', error)
    throw new Error('ProximityStorageFailed')
  }
}

export async function readStoredMdocBytes(credentialId: string): Promise<Uint8Array> {
  const native = requireNativeProximityModule()
  logWalletStep('proximity-storage', 'read mdoc', { credentialId })
  try {
    return await native.readMdoc(credentialId)
  } catch (error) {
    logWalletError('proximity-storage', 'read failed', error)
    throw new Error('ProximityStorageFailed')
  }
}
