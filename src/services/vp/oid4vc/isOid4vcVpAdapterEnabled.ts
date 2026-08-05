export function isOid4vcVpAdapterEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.EXPO_PUBLIC_OID4VC_VP_ADAPTER === 'true'
}
