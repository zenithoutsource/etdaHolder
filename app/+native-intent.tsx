import { redirectWalletSystemPath } from '@/src/services/credentials/redirectIssuanceCallbackPath'

export function redirectSystemPath({
  path,
}: {
  path: string
  initial: boolean
}): string {
  return redirectWalletSystemPath(path)
}
