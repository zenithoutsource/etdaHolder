import { parseIssuanceCallbackUrl } from '../credentials/parseIssuanceCallbackUrl'
import { resolvePresentationRequestUri } from '../credentials/resolvePresentationRequestUri'
import { isPortalReturnUrlIgnoredDuringCapture } from '../credentials/portalReturnBridge'
import { isPresentationRequestDeeplink, useDeeplinkStore } from '../../store/deeplinkStore'
import { isPresentationRequestConsumed } from './presentationRequestReplay'

export const PRESENTATION_REQUEST_ALREADY_USED_MESSAGE =
  'คำขอการตรวจสอบนี้ถูกดำเนินการแล้ว \n โปรดขอคำขอใหม่จากผู้ตรวจสอบ'

export const PRESENTATION_REQUEST_ALREADY_HANDLED_MESSAGE =
  'คำขอการตรวจสอบนี้ถูกปิดไปแล้ว \n โปรดขอคำขอใหม่จากผู้ตรวจสอบ'

export type PresentationIntakeRejectionReason = 'consumed' | 'dismissed'

export function readPresentationRequestUriFromIntake(url: string): string | null {
  const resolved = resolvePresentationRequestUri(url)
  if (resolved) return resolved

  const parsed = parseIssuanceCallbackUrl(url)
  return parsed.kind === 'presentation_request' ? parsed.uri : null
}

export function readPresentationIntakeRejection(url: string): PresentationIntakeRejectionReason | null {
  if (isPortalReturnUrlIgnoredDuringCapture(url)) return null

  const requestUri = readPresentationRequestUriFromIntake(url)
  if (!requestUri || !isPresentationRequestDeeplink(requestUri)) return null

  return readPresentationIntakeRejectionForUri(requestUri)
}

export function readPresentationIntakeRejectionForUri(
  requestUri: string,
  dismissedUri: string | null = useDeeplinkStore.getState().dismissedUri,
): PresentationIntakeRejectionReason | null {
  if (!isPresentationRequestDeeplink(requestUri)) return null
  if (isPresentationRequestConsumed(requestUri)) return 'consumed'
  if (requestUri === dismissedUri) return 'dismissed'
  return null
}

export function presentationIntakeRejectionMessage(
  reason: PresentationIntakeRejectionReason,
): string {
  return reason === 'consumed'
    ? PRESENTATION_REQUEST_ALREADY_USED_MESSAGE
    : PRESENTATION_REQUEST_ALREADY_HANDLED_MESSAGE
}

export function notifyPresentationIntakeRejection(url: string): boolean {
  const rejection = readPresentationIntakeRejection(url)
  if (!rejection) return false
  useDeeplinkStore.getState().setPresentationIntakeError(
    presentationIntakeRejectionMessage(rejection),
  )
  return true
}

export function notifyPresentationIntakeRejectionForUri(requestUri: string): boolean {
  const rejection = readPresentationIntakeRejectionForUri(requestUri)
  if (!rejection) return false
  useDeeplinkStore.getState().setPresentationIntakeError(
    presentationIntakeRejectionMessage(rejection),
  )
  return true
}
