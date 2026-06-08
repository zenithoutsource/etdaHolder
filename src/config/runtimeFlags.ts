export function isBiometricDisabledForTesting(isDevelopment = __DEV__): boolean {
  return isDevelopment && process.env.EXPO_PUBLIC_DISABLE_BIOMETRIC_FOR_TESTING === 'true'
}
