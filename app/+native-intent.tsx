/**
 * Expo system-path rewrite so portal/callback URLs land on /callback with search params.
 * Journey: Scan / same-device issuance return (P1).
 * Copy: none.
 * Next: app/callback.tsx
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

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
