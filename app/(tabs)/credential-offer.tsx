import { CredentialOfferClaimScreen } from '../../src/screens/CredentialOfferClaimScreen'
import { useDeeplinkStore } from '../../src/store/deeplinkStore'

export default function CredentialOfferRoute() {
  const gen = useDeeplinkStore((s) => s.offerGeneration)
  return <CredentialOfferClaimScreen key={gen} />
}
