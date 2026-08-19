/**
 * Hidden OID4VP request route — remounts PresentationRequestScreen on vpGeneration.
 * Journey: P4 Verifier QR / deeplink VP.
 * Next: src/screens/PresentationRequestScreen.tsx
 * Map: docs/CODEMAPS/frontend.md#oid4vp-request
 */

import { PresentationRequestScreen } from '../../src/screens/PresentationRequestScreen'
import { useDeeplinkStore } from '../../src/store/deeplinkStore'

export default function PresentationRequestRoute() {
  const gen = useDeeplinkStore((s) => s.vpGeneration)
  return <PresentationRequestScreen key={gen} />
}
