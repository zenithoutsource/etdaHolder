/**
 * Hidden offer route — thin wrapper around CredentialOfferClaimScreen.
 * Journey: P1 issuance (from Scan or callback).
 * Next: src/screens/CredentialOfferClaimScreen.tsx
 * Map: docs/CODEMAPS/frontend.md#scan-and-issuance
 */

import { CredentialOfferClaimScreen } from '../../src/screens/CredentialOfferClaimScreen'

export default function CredentialOfferRoute() {
  return <CredentialOfferClaimScreen />
}
