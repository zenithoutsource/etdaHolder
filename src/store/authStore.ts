import { create } from 'zustand'

import {
  login as authLogin,
  logout as authLogout,
  loadSession,
  register as authRegister,
  type SessionData,
} from '../services/auth/authService'

type AuthState = {
  token: string | null
  walletId: string | null
  accountId: string | null
  isAuthenticated: boolean
  isLoading: boolean
}

type AuthActions = {
  loadSession: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => Promise<void>
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

  loadSession: async () => {
    const session = await loadSession()
    if (session) {
      set(applySession(session))
    }
  },

  login: async (email, password) => {
    set({ isLoading: true })
    try {
      const session = await authLogin(email, password)
      set({ ...applySession(session), isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  register: async (email, password, name) => {
    set({ isLoading: true })
    try {
      await authRegister(email, password, name)
      set({ isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  logout: async () => {
    await authLogout()
    set({ token: null, walletId: null, accountId: null, isAuthenticated: false })
  },
}))
