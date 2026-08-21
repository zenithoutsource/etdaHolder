/**
 * After PIN reset: clear the session and return to /auth.
 * Do not wipe credential MMKV or the storage encryption key.
 */

export async function completeForgotPinRecovery(input: {
  logout: () => Promise<void>
  markStartupReady: () => void
  replaceAuth: () => void
}): Promise<void> {
  await input.logout()
  input.markStartupReady()
  input.replaceAuth()
}
