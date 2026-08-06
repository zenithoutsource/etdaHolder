import { create } from 'zustand'

// Not used on portal offer-URI path — see docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md
import type { IssuerPortalCredentialType } from '../config/issuerPortalUrls'
import type { ResolvedCredentialOffer } from '../services/vci/exchangeService'

export type SameDeviceIssuancePhase =
  | 'portal'
  | 'awaiting_pid_vp'
  | 'claim'
  | 'done'
  | 'failed'

export type AuthorizationCodeExchange = {
  authorizationCode: string
  codeVerifier: string
  redirectUri: string
  clientId: string
  tokenEndpoint: string
}

export type SameDeviceIssuanceSession = {
  id: string
  credentialType: IssuerPortalCredentialType
  phase: SameDeviceIssuancePhase
  codeVerifier: string
  authorizationCode?: string
  redirectUri: string
  resolvedOffer?: ResolvedCredentialOffer
  authorizationExchange?: AuthorizationCodeExchange
}

type SameDeviceIssuanceState = {
  session: SameDeviceIssuanceSession | null
  setSession: (session: SameDeviceIssuanceSession | null) => void
  patchSession: (patch: Partial<SameDeviceIssuanceSession>) => void
  clearSession: () => void
}

export const useSameDeviceIssuanceStore = create<SameDeviceIssuanceState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  patchSession: (patch) => set((state) => (
    state.session ? { session: { ...state.session, ...patch } } : state
  )),
  clearSession: () => set({ session: null }),
}))

export function readActiveSameDeviceSession(): SameDeviceIssuanceSession | null {
  return useSameDeviceIssuanceStore.getState().session
}

export function isAwaitingSameDevicePidVp(): boolean {
  return useSameDeviceIssuanceStore.getState().session?.phase === 'awaiting_pid_vp'
}
