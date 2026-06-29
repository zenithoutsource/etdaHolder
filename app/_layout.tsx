import '@/src/sdk/fetchIndirection';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import '../global.css';
import '@/src/styles/nativewindInterop';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppDialogProvider } from '@/src/components/AppDialog';
import { installWalletApiFetch } from '@/src/sdk/installWalletApiFetch';
import { hasWalletPin } from '@/src/services/auth/walletPin';
import { readStartupRoute } from '@/src/services/auth/walletPinNavigation';
import { logWalletError, logWalletStep } from '@/src/services/debug/walletLogger';
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

type StartupState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

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
  const [startupState, setStartupState] = useState<StartupState>({ status: 'loading' });
  const loadSession = useAuthStore((s) => s.loadSession);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
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

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    let isMounted = true;

    async function prepareWallet(): Promise<void> {
      try {
        logWalletStep('startup', 'prepare-wallet-start', { platform: Platform.OS });
        if (Platform.OS === 'web') {
          logWalletStep('startup', 'platform-web-ready');
          if (isMounted) setStartupState({ status: 'ready' });
          return;
        }

        const [
          { generateWalletKeyIfNeeded, getHolderDid },
          { initPushNotifications },
          { initStorage },
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
        logWalletStep('startup', 'native-modules-imported');
        runNativeEd25519Diagnostics();

        const { default: JailMonkey } = await import('jail-monkey');
        assertDeviceIntegrity({ isJailBroken: JailMonkey.isJailBroken() });
        logWalletStep('startup', 'device-integrity-ok');
        assertConfiguredWalletApiRuntimePolicy();
        logWalletStep('startup', 'runtime-policy-ok');

        await initStorage();
        logWalletStep('startup', 'storage-init-complete');
        await generateWalletKeyIfNeeded();
        logWalletStep('startup', 'wallet-key-ready');
        await loadSession();
        logWalletStep('startup', 'session-loaded');
        await initPushNotifications(getHolderDid());
        logWalletStep('startup', 'push-notifications-ready');
        if (isMounted) setStartupState({ status: 'ready' });
        logWalletStep('startup', 'prepare-wallet-ready');
      } catch (error) {
        logWalletError('startup', 'prepare-wallet-failed', error);
        if (isMounted) {
          setStartupState({
            status: 'error',
            message: toUserMessage(toErrorMessage(error)),
          });
        }
      } finally {
        await SplashScreen.hideAsync().catch(() => undefined);
      }
    }

    void prepareWallet();

    return () => {
      isMounted = false;
    };
  }, [loadSession]);

  useEffect(() => {
    if (startupState.status !== 'ready') return;
    const route = readStartupRoute({
      isAuthenticated,
      currentSegment,
      platform: Platform.OS,
      hasWalletPin: Platform.OS !== 'web' && hasWalletPin(),
    });
    if (route) router.replace(route);
  }, [startupState.status, isAuthenticated, router, currentSegment]);

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
        currentSegment,
        platform: Platform.OS,
        hasWalletPin: Platform.OS !== 'web' && hasWalletPin(),
      });
      if (startupRoute !== '/login' && startupRoute !== '/pin-setup') {
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
  }, [startupState.status, incomingUrl, isAuthenticated, currentSegment, router, routeDeeplink, setPendingDeeplinkUri, setIncomingDeeplinkUri]);

  useEffect(() => {
    if (startupState.status !== 'ready' || !pendingDeeplinkUri) {
      lastRoutedDeeplinkRef.current = null;
      return;
    }
    if (pendingDeeplinkUri === lastRoutedDeeplinkRef.current) return;
    lastRoutedDeeplinkRef.current = pendingDeeplinkUri;
    routeDeeplink(pendingDeeplinkUri);
  }, [startupState.status, pendingDeeplinkUri, dismissedDeeplinkUri, isAuthenticated, routeDeeplink]);

  if (startupState.status !== 'ready') {
    return (
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppDialogProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: 'Create Account' }} />
          <Stack.Screen name="pin-setup" options={{ headerShown: false }} />
          <Stack.Screen name="pin-lock" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style={isTabRoute ? 'light' : 'dark'} backgroundColor={isTabRoute ? '#002887' : '#f4f6fa'} />
      </AppDialogProvider>
    </ThemeProvider>
  );
}
