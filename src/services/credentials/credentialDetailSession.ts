export function shouldResetCredentialDetailSession(
  previousCredentialId: string | undefined,
  nextCredentialId: string | undefined,
): boolean {
  return Boolean(previousCredentialId && nextCredentialId && previousCredentialId !== nextCredentialId)
}
