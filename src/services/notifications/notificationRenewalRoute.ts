type CredentialDetailRoute = {
  pathname: '/(tabs)/credential/[id]'
  params: { id: string }
}

export function resolveRenewalReadyReplacementRoute({
  notificationEvent,
  replacementCredentialId,
}: {
  credentialId: string
  notificationEvent?: string | string[]
  replacementCredentialId?: string
}): CredentialDetailRoute | undefined {
  if (notificationEvent !== 'renewal-ready' || !replacementCredentialId) {
    return undefined
  }

  return {
    pathname: '/(tabs)/credential/[id]',
    params: { id: replacementCredentialId },
  }
}
