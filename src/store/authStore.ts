import { create } from 'zustand'

import {
  checkEmailStatus as authCheckEmailStatus,
  confirmPinReset as authConfirmPinReset,
  login as authLogin,
  logout as authLogout,
  loadSession,
  register as authRegister,
  requestPinReset as authRequestPinReset,
  verifyPinResetOtp as authVerifyPinResetOtp,
  type SessionData,
} from '../services/auth/authService'

type AuthState = {
  token: string | null
  walletId: string | null
  accountId: string | null
  isAuthenticated: boolean
  isLoading: boolean
  isPinVerified: boolean
}

type AuthActions = {
  loadSession: () => Promise<void>
  checkEmailStatus: (email: string) => Promise<{ exists: boolean }>
  login: (email: string, pin: string) => Promise<void>
  register: (name: string, email: string, pin: string) => Promise<void>
  requestPinReset: (email: string) => Promise<void>
  verifyPinResetOtp: (email: string, otp: string) => Promise<void>
  confirmPinReset: (email: string, otp: string, pin: string) => Promise<void>
  logout: () => Promise<void>
  setPinVerified: (verified: boolean) => void
}

function applySession(session: SessionData): Pick<AuthState, 'token' | 'walletId' | 'accountId' | 'isAuthenticated'> {
  return {
    token: session.token,
    walletId: session.walletId,
    accountId: session.accountId,
    isAuthenticated: true,
  }
}

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  token: null,
  walletId: null,
  accountId: null,
  isAuthenticated: false,
  isLoading: false,
  isPinVerified: false,

  loadSession: async () => {
    const session = await loadSession()
    if (session) {
      set({ ...applySession(session), isPinVerified: false })
    }
  },

  checkEmailStatus: async (email) => {
    set({ isLoading: true })
    try {
      const result = await authCheckEmailStatus(email)
      set({ isLoading: false })
      return result
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  login: async (email, pin) => {
    set({ isLoading: true })
    try {
      const session = await authLogin(email, pin)
      set({ ...applySession(session), isLoading: false, isPinVerified: true })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  register: async (name, email, pin) => {
    set({ isLoading: true })
    try {
      const session = await authRegister(name, email, pin)
      set({ ...applySession(session), isLoading: false, isPinVerified: true })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  requestPinReset: async (email) => {
    set({ isLoading: true })
    try {
      await authRequestPinReset(email)
      set({ isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  verifyPinResetOtp: async (email, otp) => {
    set({ isLoading: true })
    try {
      await authVerifyPinResetOtp(email, otp)
      set({ isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  confirmPinReset: async (email, otp, pin) => {
    set({ isLoading: true })
    try {
      await authConfirmPinReset(email, otp, pin)
      set({ isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  logout: async () => {
    await authLogout()
    set({ token: null, walletId: null, accountId: null, isAuthenticated: false, isPinVerified: false })
  },

  setPinVerified: (verified) => set({ isPinVerified: verified }),
}))
