import { useFocusEffect } from 'expo-router';
import { allowScreenCaptureAsync, preventScreenCaptureAsync } from 'expo-screen-capture';
import { useCallback } from 'react';

/**
 * Screen-capture prevention is a window-level flag (Android FLAG_SECURE / iOS app-wide),
 * not a per-view setting. Bottom-tab screens stay mounted once visited, so toggling on
 * mount/unmount (usePreventScreenCapture) leaks the flag onto unrelated tabs such as
 * "My QR". Gate it on focus instead so it is only active while this screen is shown.
 */
export function useScreenCaptureGuard(): void {
  useFocusEffect(
    useCallback(() => {
      preventScreenCaptureAsync();
      return () => {
        allowScreenCaptureAsync();
      };
    }, [])
  );
}
