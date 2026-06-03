import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import '../global.css';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

type StartupState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string };

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [startupState, setStartupState] = useState<StartupState>({ status: 'loading' });

  useEffect(() => {
    let isMounted = true;

    async function prepareWallet(): Promise<void> {
      try {
        if (Platform.OS === 'web') {
          if (isMounted) setStartupState({ status: 'ready' });
          return;
        }

        const [{ generateWalletKeyIfNeeded }, { initStorage }, { softwareSecureEnvironment }] = await Promise.all([
          import('@/src/services/crypto/crypto'),
          import('@/src/services/storage/storage'),
          import('@/src/services/crypto/softwareSecureEnvironment'),
        ]);

        const { isLocalSecureEnvironmentSupported, setFallbackSecureEnvironment, shouldUseFallbackSecureEnvironment } =
          await import('@animo-id/expo-secure-environment');

        if (!isLocalSecureEnvironmentSupported()) {
          setFallbackSecureEnvironment(softwareSecureEnvironment);
          shouldUseFallbackSecureEnvironment(true);
        }

        await generateWalletKeyIfNeeded();
        await initStorage();
        if (isMounted) setStartupState({ status: 'ready' });
      } catch (error) {
        if (isMounted) {
          setStartupState({
            status: 'error',
            message: toErrorMessage(error),
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
  }, []);

  if (startupState.status === 'loading') {
    return null;
  }

  if (startupState.status === 'error') {
    return (
      <View style={styles.errorScreen}>
        <Text style={styles.errorTitle}>Wallet startup failed</Text>
        <Text style={styles.errorMessage}>{startupState.message}</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#ffffff',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorMessage: {
    color: '#6b7280',
    textAlign: 'center',
  },
});
