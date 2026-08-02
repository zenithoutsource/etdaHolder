import { isCredentialOfferDeeplink } from '../../store/deeplinkStore'
import { parseIssuanceCallbackUrl } from './parseIssuanceCallbackUrl'

/** Normalize direct offer deeplinks and walletapp://callback portal returns. */
export function resolveCredentialOfferDeeplink(
  uri: string | null | undefined,
): string | null {
  const trimmed = uri?.trim()
  if (!trimmed) return null
  if (isCredentialOfferDeeplink(trimmed)) return trimmed

  const parsed = parseIssuanceCallbackUrl(trimmed)
  return parsed.kind === 'credential_offer' ? parsed.uri : null
}
