import { create } from 'zustand'

import type { ReaderSharingMode } from '@/src/config/readerProfiles'
import { getReaderProfileForDocumentType, listMdocFieldKeysFromProfile } from '@/src/config/readerProfiles'
import { logWalletError } from '@/src/services/debug/walletLogger'
import { readStoredCredentialById } from '@/src/services/credentials/storedCredentials'
import {
  recordNfcPresentationDeclined,
  recordNfcPresentationFailure,
  recordNfcPresentationSuccess,
} from '@/src/services/history/walletHistoryRecording'
import { base64UrlToBytes } from '@/src/utils/jwtUtils'
import {
  armProximityPresentation,
  disarmProximityPresentation,
} from '@/src/services/proximity/proximityArmSession'
import { buildCompanionPresentation } from '@/src/services/proximity/companionPresentation'
import {
  denyProximityPresentation,
  ProximityPresentationError,
} from '@/src/services/proximity/proximityPresentation'
import { requireNativeProximityModule, subscribeToProximityEvents } from '@/src/services/proximity/nativeProximityModule'

export type ProximityStatus =
  | 'idle'
  | 'awaiting-consent'
  | 'approved'
  | 'hce-armed'
  | 'engaged'
  | 'complete'
  | 'error'
  | 'cancelled'

type ProximityState = {
  status: ProximityStatus
  selectedCredentialId: string | null
  sharingMode: ReaderSharingMode
  approvedMdocFields: string[] | null
  sharedFields: string[] | null
  error: string | null
}

type ProximityActions = {
  openPresentation: (credentialId: string, sharingMode?: ReaderSharingMode) => void
  approvePresentation: (approvedMdocFields: string[]) => Promise<void>
  denyPresentation: () => void
  reset: () => void
}

const initialState: ProximityState = {
  status: 'idle',
  selectedCredentialId: null,
  sharingMode: 'mdoc-only',
  approvedMdocFields: null,
  sharedFields: null,
  error: null,
}

let activeUnsubscribe: (() => void) | null = null

function toUserFacingError(error: unknown): string {
  if (error instanceof ProximityPresentationError) {
    switch (error.code) {
      case 'NFC_UNAVAILABLE':
        return 'NFC not supported on this device'
      case 'NFC_DISABLED':
        return 'Please enable NFC in Settings'
      case 'CREDENTIAL_NOT_FOUND':
        return 'No credential available for proximity'
      case 'PROXIMITY_NOT_READY':
        return error.message
      default:
        return 'Connection lost. Try again.'
    }
  }

  if (error instanceof Error && error.message.startsWith('ProximityPayloadTooLarge')) {
    return 'This credential is too large for NFC presentation. Use online presentation instead.'
  }

  return 'Connection lost. Try again.'
}

function readProximityDisclosureLabels(credentialId: string, sharingMode: ReaderSharingMode): string[] {
  const record = readStoredCredentialById(credentialId)
  if (!record) return []
  const profile = getReaderProfileForDocumentType(record.type, sharingMode)
  if (!profile) return []
  return listMdocFieldKeysFromProfile(profile)
}

export const useProximityStore = create<ProximityState & ProximityActions>((set, get) => ({
  ...initialState,

  openPresentation: (credentialId, sharingMode = 'mdoc-only') => {
    activeUnsubscribe?.()
    activeUnsubscribe = null
    set({
      status: 'awaiting-consent',
      selectedCredentialId: credentialId,
      sharingMode,
      approvedMdocFields: null,
      sharedFields: null,
      error: null,
    })
  },

  approvePresentation: async (approvedMdocFields) => {
    const { selectedCredentialId, sharingMode } = get()
    if (!selectedCredentialId) return

    set({ status: 'approved', approvedMdocFields, error: null })

    try {
      activeUnsubscribe?.()
      activeUnsubscribe = subscribeToProximityEvents({
        onDeviceEngaged: () => set({ status: 'engaged' }),
        onCompanionSignRequested: async (event) => {
          const credentialId = get().selectedCredentialId
          if (!credentialId) return

          try {
            const record = readStoredCredentialById(credentialId)
            if (!record?.rawVc) {
              throw new Error('CompanionCredentialMissing')
            }

            const profile = getReaderProfileForDocumentType(record.type, get().sharingMode)
            const pluginId = profile?.companion?.transportPluginId
            if (!pluginId) {
              throw new Error('CompanionTransportPluginMissing')
            }

            const presentation = await buildCompanionPresentation(pluginId, {
              sdJwt: record.rawVc,
              nonceBytes: base64UrlToBytes(event.nonceBase64Url),
            })
            await requireNativeProximityModule().supplyCompanionPresentation(presentation)
          } catch (error) {
            logWalletError('proximity-store', 'companion-sign-failed', error)
            set({ status: 'error', error: toUserFacingError(error) })
          }
        },
        onPresentationComplete: (event: { sharedFields: string[] }) => {
          const credentialId = get().selectedCredentialId
          const sharingMode = get().sharingMode
          if (credentialId) {
            const record = readStoredCredentialById(credentialId)
            if (record) {
              recordNfcPresentationSuccess(
                record,
                event.sharedFields.length > 0
                  ? event.sharedFields
                  : readProximityDisclosureLabels(credentialId, sharingMode),
              )
            }
          }
          set({ status: 'complete', sharedFields: event.sharedFields })
          activeUnsubscribe?.()
          activeUnsubscribe = null
        },
        onError: (event: { code: string; message: string }) => {
          logWalletError('proximity-store', 'presentation error', new Error(`${event.code}: ${event.message}`))
          const credentialId = get().selectedCredentialId
          const sharingMode = get().sharingMode
          if (credentialId) {
            const record = readStoredCredentialById(credentialId)
            if (record) {
              recordNfcPresentationFailure(
                record,
                readProximityDisclosureLabels(credentialId, sharingMode),
                new Error(`${event.code}: ${event.message}`),
              )
            }
          }
          set({ status: 'error', error: toUserFacingError(event) })
          activeUnsubscribe?.()
          activeUnsubscribe = null
        },
      })

      await armProximityPresentation({
        credentialId: selectedCredentialId,
        approvedMdocFields,
        sharingMode,
        mdocPayloadBytes: 0,
      })

      set({ status: 'hce-armed' })
    } catch (error) {
      logWalletError('proximity-store', 'arm failed', error)
      const credentialId = get().selectedCredentialId
      const sharingMode = get().sharingMode
      if (credentialId) {
        const record = readStoredCredentialById(credentialId)
        if (record) {
          recordNfcPresentationFailure(
            record,
            readProximityDisclosureLabels(credentialId, sharingMode),
            error,
          )
        }
      }
      activeUnsubscribe?.()
      activeUnsubscribe = null
      set({ status: 'error', error: toUserFacingError(error) })
    }
  },

  denyPresentation: () => {
    const credentialId = get().selectedCredentialId
    const sharingMode = get().sharingMode
    if (credentialId) {
      const record = readStoredCredentialById(credentialId)
      if (record) {
        recordNfcPresentationDeclined(record, readProximityDisclosureLabels(credentialId, sharingMode))
      }
    }
    void denyProximityPresentation().catch((e) => logWalletError('proximity-store', 'deny-cleanup-failed', e))
    void disarmProximityPresentation().catch((e) => logWalletError('proximity-store', 'disarm-cleanup-failed', e))
    activeUnsubscribe?.()
    activeUnsubscribe = null
    set({ ...initialState })
  },

  reset: () => {
    void denyProximityPresentation().catch((e) => logWalletError('proximity-store', 'deny-cleanup-failed', e))
    void disarmProximityPresentation().catch((e) => logWalletError('proximity-store', 'disarm-cleanup-failed', e))
    activeUnsubscribe?.()
    activeUnsubscribe = null
    set({ ...initialState })
  },
}))
