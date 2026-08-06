import { isPresentationRequestDeeplink } from '../../store/deeplinkStore'
import { parseIssuanceCallbackUrl } from './parseIssuanceCallbackUrl'

/** Normalize direct openid4vp or walletapp callback URLs into a presentation request URI. */
export function resolvePresentationRequestUri(url: string | null | undefined): string | null {
  if (!url) return null
  if (isPresentationRequestDeeplink(url)) return url

  const parsed = parseIssuanceCallbackUrl(url)
  return parsed.kind === 'presentation_request' ? parsed.uri : null
}
