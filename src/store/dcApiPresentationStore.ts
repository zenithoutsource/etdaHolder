/**
 * Pending Digital Credentials API presentation session state.
 */
import { create } from 'zustand'

import type { DcApiResolvedPresentation } from '@/src/services/vp/dcApi/dcApiPresentationService'
import type { DcApiProtocol } from '@/src/services/vp/dcApi/dcApiRequestParser'
import type { DcApiTransport } from '@/src/services/vp/dcApi/dcApiCrossDevice'

export type DcApiPresentationPhase =
  | { tag: 'idle' }
  | {
      tag: 'pending'
      sessionId: string
      protocol: DcApiProtocol
      origin: string
      request: Record<string, unknown>
      transport: DcApiTransport
      selectedCredentialId?: string | null
    }
  | {
      tag: 'ready'
      sessionId: string
      protocol: DcApiProtocol
      origin: string
      request: Record<string, unknown>
      transport: DcApiTransport
      resolved: DcApiResolvedPresentation
    }
  | { tag: 'completing'; sessionId: string }
  | { tag: 'finished'; sessionId: string }

type DcApiPresentationState = {
  phase: DcApiPresentationPhase
  routeGeneration: number
  /** Survives route remounts so consent is not shown again after the holder accepts. */
  consentAcceptedSessionId: string | null
  selectedClaimKeys: string[]
}

type DcApiPresentationActions = {
  queueIncomingRequest: (input: {
    sessionId: string
    protocol: DcApiProtocol
    origin: string
    request: Record<string, unknown>
    transport: DcApiTransport
    selectedCredentialId?: string | null
  }) => void
  setResolvedPresentation: (resolved: DcApiResolvedPresentation) => void
  markConsentAccepted: (sessionId: string, selectedClaimKeys: string[]) => void
  markCompleting: (sessionId: string) => void
  markFinished: (sessionId: string) => void
  restoreReadyPresentation: (
    resolved: DcApiResolvedPresentation,
    transport: DcApiTransport,
  ) => void
  clearPresentation: () => void
}

export const useDcApiPresentationStore = create<DcApiPresentationState & DcApiPresentationActions>((set, get) => ({
  phase: { tag: 'idle' },
  routeGeneration: 0,
  consentAcceptedSessionId: null,
  selectedClaimKeys: [],
  queueIncomingRequest: (input) => {
    set((state) => ({
      phase: {
        tag: 'pending',
        sessionId: input.sessionId,
        protocol: input.protocol,
        origin: input.origin,
        request: input.request,
        transport: input.transport,
        ...(input.selectedCredentialId ? { selectedCredentialId: input.selectedCredentialId } : {}),
      },
      routeGeneration: state.routeGeneration + 1,
      consentAcceptedSessionId: null,
      selectedClaimKeys: [],
    }))
  },
  setResolvedPresentation: (resolved) => {
    const phase = get().phase
    if (phase.tag !== 'pending' || phase.sessionId !== resolved.sessionId) {
      return
    }
    set({
      phase: {
        tag: 'ready',
        sessionId: resolved.sessionId,
        protocol: resolved.protocol,
        origin: resolved.origin,
        request: resolved.authorizationRequest,
        transport: phase.transport,
        resolved,
      },
    })
  },
  markConsentAccepted: (sessionId, selectedClaimKeys) => {
    set({
      consentAcceptedSessionId: sessionId,
      selectedClaimKeys: [...selectedClaimKeys],
    })
  },
  markCompleting: (sessionId) => {
    set({ phase: { tag: 'completing', sessionId } })
  },
  markFinished: (sessionId) => {
    set({ phase: { tag: 'finished', sessionId } })
  },
  restoreReadyPresentation: (resolved, transport) => {
    const phase = get().phase
    if (phase.tag !== 'completing' || phase.sessionId !== resolved.sessionId) {
      return
    }
    set({
      phase: {
        tag: 'ready',
        sessionId: resolved.sessionId,
        protocol: resolved.protocol,
        origin: resolved.origin,
        request: resolved.authorizationRequest,
        transport,
        resolved,
      },
    })
  },
  clearPresentation: () => {
    set({
      phase: { tag: 'idle' },
      consentAcceptedSessionId: null,
      selectedClaimKeys: [],
    })
  },
}))

export function readDcApiPresentationRouteGeneration(): number {
  return useDcApiPresentationStore.getState().routeGeneration
}

export function hasPendingDcApiPresentationPhase(): boolean {
  const phase = useDcApiPresentationStore.getState().phase
  return phase.tag === 'pending' || phase.tag === 'ready' || phase.tag === 'completing'
}
