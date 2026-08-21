/** Global modal dialog provider and useAppDialog hook. Hidden while PIN lock is required. */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Modal, Platform, Pressable, Text, View } from 'react-native'

import { THEME } from '../config/themeColors'
import { hasWalletPin } from '../services/auth/walletPin'
import {
  isWalletPinLockRequired,
  readWalletPinLockRequired,
} from '../services/auth/walletPinNavigation'
import { logWalletStep } from '../services/debug/walletLogger'
import { useAuthStore } from '../store/authStore'
import {
  readPendingCredentialOfferRoute,
  readPendingPresentationRoute,
  useDeeplinkStore,
} from '../store/deeplinkStore'

export type AppDialogAction = {
  label: string
  onPress?: () => void | Promise<void>
  variant?: 'primary' | 'secondary' | 'danger'
  dismissOnPress?: boolean
}

export type AppDialogOptions = {
  title: string
  message?: string
  icon?: 'info' | 'success' | 'warning' | 'danger' | 'lock'
  iconSize?: number
  iconContainerClassName?: string
  actions?: AppDialogAction[]
  dismissible?: boolean
}

type AppDialogContextValue = {
  showDialog: (options: AppDialogOptions) => void
  hideDialog: () => void
}

const AppDialogContext = createContext<AppDialogContextValue | null>(null)

const iconByTone: Record<NonNullable<AppDialogOptions['icon']>, keyof typeof MaterialCommunityIcons.glyphMap> = {
  danger: 'alert-circle-outline',
  info: 'information-outline',
  lock: 'lock-outline',
  success: 'check-circle-outline',
  warning: 'alert-outline',
}

const iconClassByTone: Record<NonNullable<AppDialogOptions['icon']>, string> = {
  danger: 'bg-red-50',
  info: 'bg-blue-50',
  lock: 'bg-blue-50',
  success: 'bg-green-50',
  warning: 'bg-amber-50',
}

const iconColorByTone: Record<NonNullable<AppDialogOptions['icon']>, string> = {
  danger: THEME.danger,
  info: THEME.navy,
  lock: THEME.navy,
  success: THEME.success,
  warning: THEME.goldDark,
}

function actionClassName(variant: AppDialogAction['variant']): string {
  if (variant === 'danger') return 'bg-danger'
  if (variant === 'secondary') return 'border border-slate130 bg-white'
  return 'bg-wallet-navy'
}

function actionTextClassName(variant: AppDialogAction['variant']): string {
  if (variant === 'secondary') return 'text-ink'
  return 'text-white'
}

function hasPendingPinUnlockDeeplinkRoute(): boolean {
  const { pendingUri, dismissedUri } = useDeeplinkStore.getState()
  const { isAuthenticated } = useAuthStore.getState()
  const pinExists = Platform.OS !== 'web' && hasWalletPin()
  const routeInput = {
    pendingUri,
    dismissedUri,
    isAuthenticated,
    platform: Platform.OS,
    hasWalletPin: pinExists,
  }

  return Boolean(
    readPendingCredentialOfferRoute(routeInput)
    || readPendingPresentationRoute(routeInput),
  )
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<AppDialogOptions | null>(null)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const isPinVerified = useAuthStore((state) => state.isPinVerified)
  const pinLockRequired = isWalletPinLockRequired({
    platform: Platform.OS,
    isAuthenticated,
    isPinVerified,
    hasWalletPin: Platform.OS !== 'web' && hasWalletPin(),
  })
  const wasPinLockedRef = useRef(pinLockRequired)
  const dialogVisible = Boolean(dialog) && !pinLockRequired

  const hideDialog = useCallback(() => {
    setDialog(null)
  }, [])

  const showDialog = useCallback((options: AppDialogOptions) => {
    setDialog(options)
  }, [])

  useEffect(() => {
    if (pinLockRequired) {
      if (dialog) {
        logWalletStep('wallet-unlock', 'app-dialog-deferred', { title: dialog.title })
      }
      wasPinLockedRef.current = true
      return
    }

    if (wasPinLockedRef.current && dialog) {
      if (hasPendingPinUnlockDeeplinkRoute()) {
        logWalletStep('wallet-unlock', 'app-dialog-dropped-pending-deeplink', {
          title: dialog.title,
        })
        setDialog(null)
      } else {
        logWalletStep('wallet-unlock', 'app-dialog-restored', { title: dialog.title })
      }
    }
    wasPinLockedRef.current = false
  }, [dialog, pinLockRequired])

  const contextValue = useMemo(
    () => ({
      hideDialog,
      showDialog,
    }),
    [hideDialog, showDialog],
  )

  const dismissible = dialog?.dismissible !== false
  const actions: AppDialogAction[] = dialog?.actions?.length
    ? dialog.actions
    : [{ label: 'OK', variant: 'primary' }]
  const icon = dialog?.icon ?? 'info'

  async function handleActionPress(action: AppDialogAction) {
    if (readWalletPinLockRequired()) return
    await action.onPress?.()
    if (action.dismissOnPress !== false) hideDialog()
  }

  return (
    <AppDialogContext.Provider value={contextValue}>
      {children}
      <Modal
        animationType="fade"
        transparent
        visible={dialogVisible}
        onRequestClose={dismissible && dialogVisible ? hideDialog : undefined}>
        <View className="flex-1 items-center justify-center bg-black/35 px-5">
          <Pressable
            testID="app-dialog-backdrop"
            className="absolute inset-0"
            disabled={!dismissible || !dialogVisible}
            onPress={hideDialog}
          />
          {dialogVisible && dialog ? (
            <View
              testID="app-dialog"
              className="w-full max-w-[360px] rounded-[18px] bg-white p-5"
              style={{
                elevation: 8,
                shadowColor: THEME.navyShadow,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.18,
                shadowRadius: 16,
              }}>
              <View className="items-center">
                <View className={dialog.iconContainerClassName ?? `h-14 w-14 items-center justify-center rounded-full ${iconClassByTone[icon]}`}>
                  <MaterialCommunityIcons name={iconByTone[icon]} size={dialog.iconSize ?? 30} color={iconColorByTone[icon]} />
                </View>
                <Text className="mt-4 text-center text-[18px] font-bold leading-[26px] text-ink">
                  {dialog.title}
                </Text>
                {dialog.message ? (
                  <Text className="mt-2 text-center text-[14px] leading-[22px] text-slate">
                    {dialog.message}
                  </Text>
                ) : null}
              </View>

              <View className="mt-5 gap-2">
                {actions.map((action) => (
                  <Pressable
                    key={action.label}
                    accessibilityRole="button"
                    className={`min-h-[44px] items-center justify-center rounded-full px-5 ${actionClassName(action.variant)}`}
                    onPress={() => {
                      void handleActionPress(action)
                    }}>
                    <Text className={`text-[14px] font-bold leading-[22px] ${actionTextClassName(action.variant)}`}>
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </AppDialogContext.Provider>
  )
}

export function useAppDialog(): AppDialogContextValue {
  const context = useContext(AppDialogContext)
  if (!context) throw new Error('useAppDialog must be used within AppDialogProvider')
  return context
}
