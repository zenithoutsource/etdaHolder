/**
 * Null host that runs useCredentialExpiryWatch on the tab shell.
 * Journey: P3 document expiry (global).
 * Next: src/hooks/useCredentialExpiryWatch.ts
 * Map: docs/CODEMAPS/frontend.md#global-hosts
 */

import { useCredentialExpiryWatch } from '@/src/hooks/useCredentialExpiryWatch'

export function CredentialExpiryHost() {
  useCredentialExpiryWatch()
  return null
}
