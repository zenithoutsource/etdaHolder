import type { PresentationFlowOrigin } from '../vp/oid4vc/types'
import type { OfferFlowOrigin } from '../../store/deeplinkStore'
import { useDeeplinkStore } from '../../store/deeplinkStore'

export type WalletHistoryDeliveryPath = 'qr' | 'deep-link'

export function mapFlowOriginToDeliveryPath(
  origin: OfferFlowOrigin | 'scan' | 'same-device' | null | undefined,
): WalletHistoryDeliveryPath | undefined {
  if (origin === 'scan') return 'qr'
  if (origin === 'same-device') return 'deep-link'
  return undefined
}

export function mapPresentationFlowOriginToDeliveryPath(
  origin: PresentationFlowOrigin | null | undefined,
): WalletHistoryDeliveryPath | undefined {
  if (origin === 'scan') return 'qr'
  if (origin === 'same-device') return 'deep-link'
  return undefined
}

export function readActiveOfferDeliveryPath(): WalletHistoryDeliveryPath | undefined {
  const state = useDeeplinkStore.getState()
  return mapFlowOriginToDeliveryPath(
    state.activeOfferFlowOrigin ?? state.pendingOfferFlowOrigin,
  )
}
