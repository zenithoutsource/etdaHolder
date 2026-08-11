import { redirectWalletSystemPath } from '@/src/services/credentials/redirectIssuanceCallbackPath'

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string
  initial: boolean
}): string | null {
  return redirectWalletSystemPath(path, { initial })
}
