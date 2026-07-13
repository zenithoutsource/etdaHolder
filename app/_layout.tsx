import '@/src/sdk/fetchIndirection';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Redirect, Stack, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Text, View } from 'react-native';
import '../global.css';
import '@/src/styles/nativewindInterop';
import 'react-native-reanimated';

import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { AppDialogProvider } from '@/src/components/AppDialog';
import { StoragePinMigrationStep } from '@/src/components/auth/StoragePinMigrationStep';
import { ForgotPinFlow } from '@/src/components/auth/ForgotPinFlow';
import { StartupStoragePinUnlock } from '@/src/components/StartupStoragePinUnlock';
import { installWalletApiFetch } from '@/src/sdk/installWalletApiFetch';
import { hasWalletPin, setWalletPin } from '@/src/services/auth/walletPin';
import { isWalletPinSessionActive } from '@/src/services/auth/walletPinSession';
import { readStartupRoute, readWalletAccessRedirect } from '@/src/services/auth/walletPinNavigation';
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger';
import {
  readPrepareWalletStartState,
  readStorageBiometricReadyState,
  readStoragePinForgotPinMode,
  readStoragePinMigrationBiometricState,
  readStoragePinMigrationPinState,
  readStoragePinUnlockFailureState,
  readStoragePinUnlockMode,
  readStorageUnlockCancelledState,
  type RootStartupState,
} from '@/src/services/startup/startupState';
import { useAuthStore } from '@/src/store/authStore';
import {
  isSupportedWalletDeeplink,
  readPendingCredentialOfferRoute,
  readPendingPresentationRoute,
  useDeeplinkStore,
} from '@/src/store/deeplinkStore';
import { useNotificationRouteStore } from '@/src/store/notificationRouteStore';

import { THEME } from '../src/config/themeColors'

export const unstable_settings = {
  anchor: '(tabs)',
};

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
installWalletApiFetch();

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toUserMessage(message: string): string {
  if (__DEV__) return message;

  if (message.includes('Secure lock screen') || message.includes('No fingerprints enrolled') || message.includes('BIOMETRY_NOT_ENROLLED'))
    return 'กรุณาตั้งค่าการล็อกหน้าจอหรือ Biometric ก่อนใช้งาน Wallet'
  if (message.includes('StorageInitializationFailed'))
    return 'ไม่สามารถเปิดพื้นที่จัดเก็บข้อมูลได้ กรุณาลองใหม่อีกครั้ง'
  if (message.includes('WalletKeyNotInitialized'))
    return 'ไม่สามารถสร้าง Wallet Key ได้ กรุณาลองใหม่อีกครั้ง'
  if (message.includes('DeviceIntegrityCompromised'))
    return 'ไม่สามารถใช้งาน Wallet บนอุปกรณ์ที่ผ่านการ Root หรือ Jailbreak ได้'
  if (message.includes('WalletApiTransportSecurityRequired') || message.includes('WalletApiCertificatePinsRequired'))
    return 'Wallet Backend security configuration is incomplete for this build.'
  return 'เกิดข้อผิดพลาดในการเริ่มต้น Wallet กรุณาลองใหม่อีกครั้ง'
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const segments = useSegments();
  const [startupState, setStartupState] = useState<RootStartupState>({ status: 'loading' });
  const [isResumePinCheckPending, setIsResumePinCheckPending] = useState(false);
  const loadSession = useAuthStore((s) => s.loadSession);
  const logout = useAuthStore((s) => s.logout);
  const setPinVerified = useAuthStore((s) => s.setPinVerified);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isPinVerified = useAuthStore((s) => s.isPinVerified);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const setPendingDeeplinkUri = useDeeplinkStore((s) => s.setPendingDeeplinkUri);
  const setIncomingDeeplinkUri = useDeeplinkStore((s) => s.setIncomingDeeplinkUri);
  const pendingDeeplinkUri = useDeeplinkStore((s) => s.pendingUri);
  const dismissedDeeplinkUri = useDeeplinkStore((s) => s.dismissedUri);
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const currentSegment = segments[0];
  const isTabRoute = currentSegment === '(tabs)';
  const lastRoutedDeeplinkRef = useRef<string | null>(null);
  const prepareWalletRunIdRef = useRef(0);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  const prepareWallet = useCallback(async ({
    storagePin,
    openStorageForMigration = false,
  }: { storagePin?: string; openStorageForMigration?: boolean } = {}): Promise<void> => {
    const runId = prepareWalletRunIdRef.current + 1;
    prepareWalletRunIdRef.current = runId;
    const isCurrentRun = () => prepareWalletRunIdRef.current === runId;

    try {
      logWalletStep('startup', 'prepare-wallet-start', { platform: Platform.OS, storagePin: Boolean(storagePin) });

      if (Platform.OS === 'web') {
        logWalletStep('startup', 'platform-web-ready');
        setStartupState({ status: 'ready' });
        return;
      }

      const [
        { generateWalletKeyIfNeeded, getHolderDid },
        { initStorage, initStorageWithPin, isStoragePinFallbackAvailable, canVerifyStoragePinUnlock, needsStoragePinFallbackMigration },
        { assertDeviceIntegrity },
        { assertConfiguredWalletApiRuntimePolicy },
      ] = await Promise.all([
        import('@/src/services/crypto/crypto'),
        import('@/src/services/storage/storage'),
        import('@/src/services/security/deviceIntegrityPolicy'),
        import('@/src/sdk/walletApiRuntimePolicy'),
      ]);

      setStartupState((currentState) =>
        readPrepareWalletStartState(currentState, {
          platform: Platform.OS,
          storagePin,
          fallbackAvailable: isStoragePinFallbackAvailable(),
          pinUnlockEnabled: canVerifyStoragePinUnlock(),
        }),
      );
      logWalletStep('startup', 'native-modules-imported');

      const { default: JailMonkey } = await import('jail-monkey');
      assertDeviceIntegrity({ isJailBroken: JailMonkey.isJailBroken() });
      logWalletStep('startup', 'device-integrity-ok');
      assertConfiguredWalletApiRuntimePolicy();
      logWalletStep('startup', 'runtime-policy-ok');

      const { loadSession: loadSessionFromKeychain } = await import('@/src/services/auth/authService');
      const existingSession = await loadSessionFromKeychain();

      if (
        !storagePin &&
        !openStorageForMigration &&
        existingSession &&
        !isStoragePinFallbackAvailable()
      ) {
        logWalletStep('startup', 'storage-pin-migration-biometric-deferred');
        if (isCurrentRun()) {
          setStartupState(readStoragePinMigrationBiometricState());
        }
        return;
      }

      try {
        if (storagePin) {
          try {
            await initStorageWithPin(storagePin);
          } catch (pinUnlockError) {
            const pinUnlockMessage = toErrorMessage(pinUnlockError);
            if (pinUnlockMessage !== 'StoragePinFallbackRequired') {
              throw pinUnlockError;
            }

            logWalletStep('startup', 'storage-pin-fallback-provision-required');
            if (isCurrentRun()) {
              setStartupState(
                readStorageBiometricReadyState(
                  isStoragePinFallbackAvailable(),
                  canVerifyStoragePinUnlock(),
                ),
              );
            }
            await initStorage({ requireBiometric: Boolean(existingSession) });
            setWalletPin(storagePin);
            logWalletStep('startup', 'storage-pin-fallback-provisioned-after-pin');
          }
        } else {
          if (isCurrentRun() && !openStorageForMigration && existingSession) {
            setStartupState(
              readStorageBiometricReadyState(
                isStoragePinFallbackAvailable(),
                canVerifyStoragePinUnlock(),
              ),
            );
          }
          await initStorage({ requireBiometric: Boolean(existingSession) });
        }
      } catch (storageError) {
        if (!isCurrentRun()) return;

        if (!storagePin && toErrorMessage(storageError) === 'StorageUnlockCancelled') {
          if (openStorageForMigration) {
            logWalletStep('startup', 'storage-pin-migration-biometric-cancelled');
            setStartupState(readStoragePinMigrationBiometricState());
            return;
          }

          logWalletStep('startup', 'storage-unlock-cancelled');
          setStartupState(
            readStorageUnlockCancelledState(
              isStoragePinFallbackAvailable(),
              canVerifyStoragePinUnlock(),
            ),
          );
          return;
        }

        if (storagePin && toErrorMessage(storageError) === 'StorageUnlockCancelled') {
          logWalletStep('startup', 'storage-pin-biometric-cancelled-after-pin');
          setStartupState(
            readStorageUnlockCancelledState(
              isStoragePinFallbackAvailable(),
              canVerifyStoragePinUnlock(),
            ),
          );
          return;
        }

        if (openStorageForMigration && !storagePin) {
          logWalletError('startup', 'storage-pin-migration-biometric-failed', storageError);
          setStartupState(
            readStoragePinMigrationBiometricState('ไม่สามารถสแกนลายนิ้วมือได้ กรุณาลองใหม่อีกครั้ง'),
          );
          return;
        }

        if (storagePin) {
          const storageErrorMessage = toErrorMessage(storageError);
          const fallbackAvailable = isStoragePinFallbackAvailable();
          const pinUnlockEnabled = canVerifyStoragePinUnlock();
          if (
            storageErrorMessage === 'StoragePinFallbackUnavailable' ||
            storageErrorMessage === 'StoragePinVerifierMismatch'
          ) {
            if (storageErrorMessage === 'StoragePinFallbackUnavailable') {
              logWalletStep('startup', 'storage-pin-fallback-unavailable');
            } else {
              logWalletStep('startup', 'storage-pin-verifier-mismatch');
            }
          } else {
            logWalletError('startup', 'storage-pin-unlock-failed', storageError);
          }
          setStartupState((currentState) => {
            const mode =
              currentState.status === 'storage-pin-required' ? currentState.mode : 'unlock';
            return readStoragePinUnlockFailureState(
              storageErrorMessage,
              fallbackAvailable,
              pinUnlockEnabled,
              mode,
            );
          });
          return;
        }

        throw storageError;
      }

      if (!isCurrentRun()) return;

      logWalletStep('startup', 'storage-init-complete');
      const { ensureWalletHistoryBackfill } = await import('@/src/services/history/walletEventLog');
      ensureWalletHistoryBackfill();
      logWalletStep('startup', 'wallet-history-backfill-complete');
      await generateWalletKeyIfNeeded();
      if (!isCurrentRun()) return;
      logWalletStep('startup', 'wallet-key-ready');
      await loadSession();
      if (!isCurrentRun()) return;

      const authState = useAuthStore.getState();
      if (authState.isAuthenticated && needsStoragePinFallbackMigration()) {
        logWalletStep('startup', 'storage-pin-migration-required');
        setStartupState(readStoragePinMigrationPinState());
        return;
      }

      // PIN storage unlock, or biometric unlock when PIN fallback already exists — skip pin-lock.
      if (authState.isAuthenticated && (storagePin || (hasWalletPin() && isStoragePinFallbackAvailable()))) {
        setPinVerified(true)
      }
      logWalletStep('startup', 'session-loaded');
      void import('@/src/services/notifications/pushNotificationService')
        .then(({ launchPushNotificationsInBackground }) => {
          launchPushNotificationsInBackground(getHolderDid());
          logWalletStep('startup', 'push-notifications-started');
        })
        .catch((error: unknown) => {
          logWalletError('startup', 'push-notifications-module-load-failed', error);
        });
      setStartupState({ status: 'ready' });
      logWalletStep('startup', 'prepare-wallet-ready');
    } catch (error) {
      if (!isCurrentRun()) return;

      logWalletError('startup', 'prepare-wallet-failed', error);
      setStartupState({
        status: 'error',
        message: toUserMessage(toErrorMessage(error)),
      });
    } finally {
      await SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [loadSession, logout, setPinVerified]);

  const handleStartupStoragePinSubmit = useCallback(
    (pin: string) => {
      void prepareWallet({ storagePin: pin });
    },
    [prepareWallet],
  );

  const handleStartupBiometricRetry = useCallback(() => {
    void prepareWallet();
  }, [prepareWallet]);

  const handleStoragePinMigrationBeginBiometric = useCallback(() => {
    setStartupState((currentState) =>
      currentState.status === 'storage-pin-migration'
        ? { ...currentState, step: 'biometric', isSubmitting: true, error: undefined }
        : currentState,
    );
    void prepareWallet({ openStorageForMigration: true });
  }, [prepareWallet]);

  const handleStoragePinMigrationComplete = useCallback(async () => {
    try {
      setPinVerified(true);
      const { getHolderDid } = await import('@/src/services/crypto/crypto');
      const { initPushNotifications } = await import('@/src/services/notifications/pushNotificationService');
      await initPushNotifications(getHolderDid());
      setStartupState({ status: 'ready' });
      logWalletStep('startup', 'prepare-wallet-ready-after-migration');
    } catch (error) {
      logWalletError('startup', 'storage-pin-migration-ready-failed', error);
      setStartupState({
        status: 'error',
        message: toUserMessage(toErrorMessage(error)),
      });
    }
  }, [setPinVerified]);

  const handleStartupForgotPin = useCallback(() => {
    setStartupState((currentState) => readStoragePinForgotPinMode(currentState));
  }, []);

  const handleStartupForgotPinBack = useCallback(() => {
    setStartupState((currentState) => readStoragePinUnlockMode(currentState));
  }, []);

  const handleStartupForgotPinComplete = useCallback(async () => {
    const { resetStorage } = await import('@/src/services/storage/storage');
    await resetStorage();
    await logout();
    setStartupState({ status: 'ready' });
    router.replace('/auth');
  }, [logout, router]);

  useEffect(() => {
    void prepareWallet();
  }, [prepareWallet]);

  useEffect(() => {
    if (startupState.status !== 'ready' || Platform.OS === 'web') return;

    const subscription = AppState.addEventListener('change', (nextState) => {
      const authState = useAuthStore.getState();
      if (!authState.isAuthenticated || !hasWalletPin()) {
        if (nextState === 'active') setIsResumePinCheckPending(false);
        return;
      }

      if (nextState !== 'active') {
        setIsResumePinCheckPending(true);
        return;
      }

      try {
        if (isWalletPinSessionActive()) {
          if (!authState.isPinVerified) {
            authState.setPinVerified(true);
            logWalletStep('wallet-unlock', 'session-restored');
          }
          return;
        }

        if (authState.isPinVerified) {
          authState.setPinVerified(false);
          logWalletStep('wallet-unlock', 'session-expired');
        }
      } finally {
        setIsResumePinCheckPending(false);
      }
    });

    return () => subscription.remove();
  }, [startupState.status]);

  useEffect(() => {
    if (startupState.status !== 'ready' || Platform.OS === 'web') return;

    let isMounted = true;

    void import('@/src/services/nfc/nfcStartup')
      .then(({ prewarmNfc }) => {
        if (!isMounted) return;
        return prewarmNfc(Platform.OS);
      })
      .catch((error) => {
        logWalletError('startup', 'nfc-prewarm-import-failed', error, { platform: Platform.OS });
      });

    return () => {
      isMounted = false;
    };
  }, [startupState.status]);

  const routeDeeplink = useCallback((url: string, { store = false }: { store?: boolean } = {}) => {
    if (!isSupportedWalletDeeplink(url)) return;
    const dismissed = useDeeplinkStore.getState().dismissedUri;
    if (url === dismissed) return;

    if (store) setPendingDeeplinkUri(url);

    const pinExists = Platform.OS === 'web' || hasWalletPin();
    const pinVerified = useAuthStore.getState().isPinVerified;
    if (pinExists && Platform.OS !== 'web' && !pinVerified) return;

    const pendingRoute = readPendingCredentialOfferRoute({
      pendingUri: url,
      dismissedUri: dismissed,
      isAuthenticated: isAuthenticatedRef.current,
      platform: Platform.OS,
      hasWalletPin: pinExists,
    });
    if (pendingRoute) { router.push(pendingRoute); return; }
    const presentationRoute = readPendingPresentationRoute({
      pendingUri: url,
      dismissedUri: dismissed,
      isAuthenticated: isAuthenticatedRef.current,
      platform: Platform.OS,
      hasWalletPin: pinExists,
    })
    if (presentationRoute) { router.push(presentationRoute); return; }
  }, [router, setPendingDeeplinkUri]);

  useEffect(() => {
    if (startupState.status !== 'ready') return;

    if (incomingUrl && isSupportedWalletDeeplink(incomingUrl) && incomingUrl !== lastRoutedDeeplinkRef.current) {
      const startupRoute = readStartupRoute({
        isAuthenticated,
        isPinVerified,
        currentSegment,
        platform: Platform.OS,
        hasWalletPin: Platform.OS !== 'web' && hasWalletPin(),
      });
      if (startupRoute !== '/auth' && startupRoute !== '/pin-setup' && startupRoute !== '/pin-lock' && currentSegment !== 'forgot-pin') {
        lastRoutedDeeplinkRef.current = incomingUrl;
        routeDeeplink(incomingUrl, { store: true });
      } else {
        setPendingDeeplinkUri(incomingUrl);
      }
    }

    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (!isSupportedWalletDeeplink(url)) return;
      setIncomingDeeplinkUri(url);
      routeDeeplink(url);
    });

    return () => { subscription.remove(); };
  }, [startupState.status, incomingUrl, isAuthenticated, isPinVerified, currentSegment, router, routeDeeplink, setPendingDeeplinkUri, setIncomingDeeplinkUri]);

  useEffect(() => {
    if (startupState.status !== 'ready' || !pendingDeeplinkUri || !isPinVerified) {
      lastRoutedDeeplinkRef.current = null;
      return;
    }
    if (pendingDeeplinkUri === lastRoutedDeeplinkRef.current) return;
    lastRoutedDeeplinkRef.current = pendingDeeplinkUri;
    routeDeeplink(pendingDeeplinkUri);
  }, [startupState.status, pendingDeeplinkUri, dismissedDeeplinkUri, isAuthenticated, isPinVerified, routeDeeplink]);

  useEffect(() => {
    if (startupState.status !== 'ready' || !isPinVerified) return;
    const route = useNotificationRouteStore.getState().consumePendingNotificationRoute();
    if (route) router.replace(route);
  }, [startupState.status, isPinVerified, router]);

  if (startupState.status !== 'ready') {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {startupState.status === 'storage-pin-migration' ? (
          <StoragePinMigrationStep
            step={startupState.step}
            error={startupState.error}
            isSubmitting={startupState.isSubmitting}
            onBeginBiometric={handleStoragePinMigrationBeginBiometric}
            onComplete={() => void handleStoragePinMigrationComplete()}
          />
        ) : startupState.status === 'storage-pin-required' ? (
          startupState.mode === 'forgot-pin' ? (
            <ForgotPinFlow
              showResetNotice
              onBack={handleStartupForgotPinBack}
              onComplete={handleStartupForgotPinComplete}
            />
          ) : (
            <StartupStoragePinUnlock
              isSubmitting={startupState.isSubmitting}
              fallbackAvailable={startupState.fallbackAvailable}
              pinUnlockEnabled={startupState.pinUnlockEnabled}
              error={startupState.error}
              onSubmit={handleStartupStoragePinSubmit}
              onRetryBiometric={handleStartupBiometricRetry}
              onForgotPin={handleStartupForgotPin}
            />
          )
        ) : (
          <View className="absolute inset-0 flex-1 items-center justify-center gap-3 bg-white p-6">
            {startupState.status === 'loading' ? (
              <>
                <ActivityIndicator color={THEME.navy} />
                <Text className="text-sm text-gray500">Starting wallet...</Text>
              </>
            ) : (
              <>
                <Text className="text-center text-lg font-semibold">Wallet startup failed</Text>
                <Text className="text-center text-gray500">{startupState.message}</Text>
              </>
            )}
          </View>
        )}
      </ThemeProvider>
    );
  }

  const walletPinExists = Platform.OS !== 'web' && hasWalletPin();
  const accessRedirect = readWalletAccessRedirect({
    isAuthenticated,
    isPinVerified,
    currentSegment,
    platform: Platform.OS,
    hasWalletPin: walletPinExists,
    isResumePinCheckPending,
  });

  if (accessRedirect && __DEV__) {
    logWalletStep('wallet-unlock', 'access-redirect', {
      target: accessRedirect,
      currentSegment,
      isAuthenticated,
      isPinVerified,
      hasWalletPin: walletPinExists,
    });
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppDialogProvider>
        {accessRedirect ? <Redirect href={accessRedirect} /> : null}
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ headerShown: false }} />
          <Stack.Screen name="forgot-pin" options={{ headerShown: false }} />
          <Stack.Screen name="pin-setup" options={{ headerShown: false }} />
          <Stack.Screen name="pin-lock" options={{ headerShown: false }} />
        </Stack>
        <StatusBar style={isTabRoute ? 'light' : 'dark'} backgroundColor="transparent" translucent />
      </AppDialogProvider>
    </ThemeProvider>
  );
}
