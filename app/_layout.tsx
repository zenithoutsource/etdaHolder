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

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppDialogProvider } from '@/src/components/AppDialog';
import { ForgotPinFlow } from '@/src/components/auth/ForgotPinFlow';
import { StartupStoragePinUnlock } from '@/src/components/StartupStoragePinUnlock';
import { installWalletApiFetch } from '@/src/sdk/installWalletApiFetch';
import { hasWalletPin } from '@/src/services/auth/walletPin';
import { readStartupRoute, readWalletAccessRedirect } from '@/src/services/auth/walletPinNavigation';
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger';
import {
  readPrepareWalletStartState,
  readStorageBiometricReadyState,
  readStoragePinForgotPinMode,
  readStoragePinUnlockFailureState,
  readStoragePinUnlockMode,
  readStorageUnlockCancelledState,
  type RootStartupState,
} from '@/src/services/startup/startupState';
import { useAuthStore } from '@/src/store/authStore';
import {
  isCredentialOfferDeeplink,
  isSupportedWalletDeeplink,
  readPendingCredentialOfferRoute,
  useDeeplinkStore,
} from '@/src/store/deeplinkStore';

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
  if (message.includes('WalletKeyNotInitialized') || message.includes('generateKeypair') || message.includes('NativeEd25519SignerRequired'))
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

  const prepareWallet = useCallback(async ({ storagePin }: { storagePin?: string } = {}): Promise<void> => {
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
        { initPushNotifications },
        { initStorage, initStorageWithPin, isStoragePinFallbackAvailable, canVerifyStoragePinUnlock },
        { assertDeviceIntegrity },
        { assertConfiguredWalletApiRuntimePolicy },
        { runNativeEd25519Diagnostics },
      ] = await Promise.all([
        import('@/src/services/crypto/crypto'),
        import('@/src/services/notifications/pushNotificationService'),
        import('@/src/services/storage/storage'),
        import('@/src/services/security/deviceIntegrityPolicy'),
        import('@/src/sdk/walletApiRuntimePolicy'),
        import('@/src/services/crypto/nativeEddsaDiagnostics'),
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
      runNativeEd25519Diagnostics();

      const { default: JailMonkey } = await import('jail-monkey');
      assertDeviceIntegrity({ isJailBroken: JailMonkey.isJailBroken() });
      logWalletStep('startup', 'device-integrity-ok');
      assertConfiguredWalletApiRuntimePolicy();
      logWalletStep('startup', 'runtime-policy-ok');

      try {
        if (storagePin) {
          await initStorageWithPin(storagePin);
        } else {
          if (isCurrentRun()) {
            setStartupState(
              readStorageBiometricReadyState(
                isStoragePinFallbackAvailable(),
                canVerifyStoragePinUnlock(),
              ),
            );
          }
          await initStorage();
        }
      } catch (storageError) {
        if (!isCurrentRun()) return;

        if (!storagePin && toErrorMessage(storageError) === 'StorageUnlockCancelled') {
          logWalletStep('startup', 'storage-unlock-cancelled');
          setStartupState(
            readStorageUnlockCancelledState(
              isStoragePinFallbackAvailable(),
              canVerifyStoragePinUnlock(),
            ),
          );
          return;
        }

        if (storagePin) {
          const storageErrorMessage = toErrorMessage(storageError);
          const fallbackAvailable = isStoragePinFallbackAvailable();
          const pinUnlockEnabled = canVerifyStoragePinUnlock();
          if (storageErrorMessage === 'StoragePinFallbackUnavailable') {
            logWalletStep('startup', 'storage-pin-fallback-unavailable');
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
      await generateWalletKeyIfNeeded();
      if (!isCurrentRun()) return;
      logWalletStep('startup', 'wallet-key-ready');
      await loadSession();
      if (!isCurrentRun()) return;
      // PIN storage unlock, or biometric unlock when PIN fallback already exists — skip pin-lock.
      const authState = useAuthStore.getState()
      if (authState.isAuthenticated && (storagePin || (hasWalletPin() && isStoragePinFallbackAvailable()))) {
        setPinVerified(true)
      }
      logWalletStep('startup', 'session-loaded');
      await initPushNotifications(getHolderDid());
      if (!isCurrentRun()) return;
      logWalletStep('startup', 'push-notifications-ready');
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
    async (pin: string) => {
      const { canVerifyStoragePinUnlock } = await import('@/src/services/storage/storage');
      if (!canVerifyStoragePinUnlock()) return;
      void prepareWallet({ storagePin: pin });
    },
    [prepareWallet],
  );

  const handleStartupBiometricRetry = useCallback(() => {
    void prepareWallet();
  }, [prepareWallet]);

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
      if (nextState === 'active') return;

      const authState = useAuthStore.getState();
      if (!authState.isAuthenticated || !hasWalletPin() || !authState.isPinVerified) return;

      authState.setPinVerified(false);
      logWalletStep('wallet-unlock', 'session-locked', { appState: nextState });
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
    if (!isCredentialOfferDeeplink(url) && isAuthenticatedRef.current && pinExists) {
      router.push('/(tabs)/scan');
    }
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

  if (startupState.status !== 'ready') {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {startupState.status === 'storage-pin-required' ? (
          startupState.mode === 'forgot-pin' ? (
            <ForgotPinFlow
              showResetNotice
              onBack={handleStartupForgotPinBack}
              onComplete={handleStartupForgotPinComplete}
            />
          ) : (
            <StartupStoragePinUnlock
              pinUnlockEnabled={startupState.pinUnlockEnabled}
              isSubmitting={startupState.isSubmitting}
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
                <ActivityIndicator color="#002887" />
                <Text className="text-sm text-[#6b7280]">Starting wallet...</Text>
              </>
            ) : (
              <>
                <Text className="text-center text-lg font-semibold">Wallet startup failed</Text>
                <Text className="text-center text-[#6b7280]">{startupState.message}</Text>
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
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style={isTabRoute ? 'light' : 'dark'} backgroundColor={isTabRoute ? '#002887' : '#f4f6fa'} />
      </AppDialogProvider>
    </ThemeProvider>
  );
}
