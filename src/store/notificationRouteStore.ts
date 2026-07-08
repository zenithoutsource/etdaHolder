import { create } from 'zustand'

export type PendingNotificationRoute = {
  pathname: '/(tabs)/credential/[id]'
  params: {
    id: string
    notificationEvent?:
      | 'renewal-ready'
      | 'document-expiring-soon'
      | 'document-expired'
  }
}

type NotificationRouteState = {
  pendingRoute: PendingNotificationRoute | null
}

type NotificationRouteActions = {
  setPendingNotificationRoute: (route: PendingNotificationRoute) => void
  consumePendingNotificationRoute: () => PendingNotificationRoute | null
}

export const useNotificationRouteStore = create<NotificationRouteState & NotificationRouteActions>((set, get) => ({
  pendingRoute: null,

  setPendingNotificationRoute: (route) => set({ pendingRoute: route }),

  consumePendingNotificationRoute: () => {
    const route = get().pendingRoute
    if (route) set({ pendingRoute: null })
    return route
  },
}))
