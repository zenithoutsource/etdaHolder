/**
 * Hidden DC API presentation route — remounts DcApiPresentationFlow on routeGeneration.
 * Journey: Chrome / digital-credentials.dev Digital Credentials API.
 * Next: src/components/DcApiPresentationFlow.tsx
 * Map: docs/CODEMAPS/frontend.md#dc-api-presentation
 */

import { DcApiPresentationFlow } from '@/src/components/DcApiPresentationFlow'
import { useReturnToWallet } from '@/src/hooks/useReturnToWallet'
import { useScreenCaptureGuard } from '@/src/hooks/useScreenCaptureGuard'
import { useDcApiPresentationStore } from '@/src/store/dcApiPresentationStore'
import { useRouter } from 'expo-router'

export default function DcApiPresentationRoute() {
  useScreenCaptureGuard()
  const router = useRouter()
  const returnToWallet = useReturnToWallet(router)
  const generation = useDcApiPresentationStore((state) => state.routeGeneration)

  return (
    <DcApiPresentationFlow
      key={generation}
      onDone={returnToWallet}
      onCancel={returnToWallet}
    />
  )
}
