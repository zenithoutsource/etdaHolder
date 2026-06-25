import { create } from 'zustand'

import { logWalletError } from '@/src/services/debug/walletLogger'
import {
  approveProximityPresentation,
  denyProximityPresentation,
  ProximityPresentationError,
  startProximityPresentation,
  stopProximityPresentation,
} from '@/src/services/proximity/proximityPresentation'

export type ProximityStatus =
  | 'idle'
  | 'waiting'
  | 'engaged'
  | 'requested'
  | 'approved'
  | 'complete'
  | 'error'

type ProximityState = {
  status: ProximityStatus
  requestedFields: string[] | null
  sharedFields: string[] | null
  selectedCredentialId: string | null
  error: string | null
}

type ProximityActions = {
  startPresentation: (credentialId: string) => Promise<void>
  approvePresentation: () => Promise<void>
  denyPresentation: () => void
  reset: () => void
}

const initialState: ProximityState = {
  status: 'idle',
  requestedFields: null,
  sharedFields: null,
  selectedCredentialId: null,
  error: null,
}

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
        return 'Proximity presentation is not ready on this build yet'
      default:
        return 'Connection lost. Try again.'
    }
  }

  return 'Connection lost. Try again.'
}

export const useProximityStore = create<ProximityState & ProximityActions>((set, get) => ({
  ...initialState,

  startPresentation: async (credentialId) => {
    set({
      status: 'waiting',
      selectedCredentialId: credentialId,
      requestedFields: null,
      sharedFields: null,
      error: null,
    })

    try {
      await startProximityPresentation(credentialId, {
        onDeviceEngaged: () => set({ status: 'engaged' }),
        onRequestReceived: (requestedFields) => set({ status: 'requested', requestedFields }),
        onPresentationComplete: (sharedFields) => set({ status: 'complete', sharedFields }),
        onError: (error) => {
          logWalletError('proximity-store', 'presentation error', error)
          set({ status: 'error', error: toUserFacingError(error) })
        },
      })
    } catch (error) {
      logWalletError('proximity-store', 'start failed', error)
      set({ status: 'error', error: toUserFacingError(error) })
    }
  },

  approvePresentation: async () => {
    const { requestedFields } = get()
    if (!requestedFields) return

    set({ status: 'approved', error: null })
    try {
      await approveProximityPresentation(requestedFields)
    } catch (error) {
      logWalletError('proximity-store', 'approve failed', error)
      set({ status: 'error', error: toUserFacingError(error) })
    }
  },

  denyPresentation: () => {
    void denyProximityPresentation().catch((e) => logWalletError('proximity-store', 'deny-cleanup-failed', e))
    set({ ...initialState })
  },

  reset: () => {
    void stopProximityPresentation().catch((e) => logWalletError('proximity-store', 'stop-cleanup-failed', e))
    set({ ...initialState })
  },
}))
