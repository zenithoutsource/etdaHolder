import '@/src/sdk/fetchIndirection';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import '../global.css';
import '@/src/styles/nativewindInterop';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AppDialogProvider } from '@/src/components/AppDialog';
import { installWalletApiFetch } from '@/src/sdk/installWalletApiFetch';
import { hasWalletPin } from '@/src/services/auth/walletPin';
import { readStartupRoute } from '@/src/services/auth/walletPinNavigation';
import { useAuthStore } from '@/src/store/authStore';

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
  const router = useRouter();
  const currentSegment = segments[0];
  const isTabRoute = currentSegment === '(tabs)';

  useEffect(() => {
    let isMounted = true;

    async function prepareWallet(): Promise<void> {
      try {
        if (Platform.OS === 'web') {
          if (isMounted) setStartupState({ status: 'ready' });
          return;
        }

        const [
          { generateWalletKeyIfNeeded },
          { initStorage },
          { assertNativeEd25519SignerSupported },
          { assertDeviceIntegrity },
          { assertConfiguredWalletApiRuntimePolicy },
          nativeEddsaSigner,
        ] = await Promise.all([
          import('@/src/services/crypto/crypto'),
          import('@/src/services/storage/storage'),
          import('@/src/services/crypto/secureEnvironmentPolicy'),
          import('@/src/services/security/deviceIntegrityPolicy'),
          import('@/src/sdk/walletApiRuntimePolicy'),
          import('@/src/services/crypto/nativeEddsaSigner'),
        ]);

        const { default: JailMonkey } = await import('jail-monkey');
        assertDeviceIntegrity({ isJailBroken: JailMonkey.isJailBroken() });
        assertConfiguredWalletApiRuntimePolicy();

        assertNativeEd25519SignerSupported(nativeEddsaSigner);

        await initStorage();
        await generateWalletKeyIfNeeded();
        await loadSession();
        if (isMounted) setStartupState({ status: 'ready' });
      } catch (error) {
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
