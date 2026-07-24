import { PresentationRequestScreen } from '../../src/screens/PresentationRequestScreen'
import { useDeeplinkStore } from '../../src/store/deeplinkStore'

export default function PresentationRequestRoute() {
  const gen = useDeeplinkStore((s) => s.vpGeneration)
  return <PresentationRequestScreen key={gen} />
}
