import { logWalletStep } from '../debug/walletLogger'
import { readWalletReturnUrl } from '../../config/sameDeviceIssuance'
import { describeIssuanceCallbackForLog } from './describeIssuanceCallbackForLog'
import { parseIssuanceCallbackUrl } from './parseIssuanceCallbackUrl'

type PortalReturnWaiter = {
  resolve: (url: string) => void
}

let activeWaiter: PortalReturnWaiter | null = null
let lastNotifiedUrl: string | undefined
let activeCapture:
  | {
    ignoredUrls: Set<string>
    ignoredUris: Set<string>
  }
  | undefined

/**
 * Bridge for Android portal flow: Custom Tabs / Expo Router may deliver
 * walletapp://callback while openAuthSessionAsync never resolves.
 * /callback and Linking notify here so the portal opener can finish.
 */
export function beginPortalReturnCapture(input: {
  ignoredUrls?: readonly string[]
  ignoredUris?: readonly string[]
} = {}): void {
  lastNotifiedUrl = undefined
  activeWaiter = null
  activeCapture = {
    ignoredUrls: new Set(input.ignoredUrls ?? []),
    ignoredUris: new Set(input.ignoredUris ?? []),
  }
}

export function endPortalReturnCapture(): void {
  activeWaiter = null
  activeCapture = undefined
}

/**
 * Prevents stale callback URLs from reaching the app-wide deep-link router
 * while an issuer portal capture is active.
 */
export function isPortalReturnUrlIgnoredDuringCapture(
  url: string,
  returnUrl: string = readWalletReturnUrl(),
): boolean {
  if (!activeCapture) return false
  if (activeCapture.ignoredUrls.has(url)) return true

  const parsed = parseIssuanceCallbackUrl(url, returnUrl)
  if (parsed.kind === 'credential_offer' || parsed.kind === 'presentation_request') {
    return activeCapture.ignoredUris.has(parsed.uri)
  }

  return false
}

export function notifyPortalReturnUrl(url: string, source: string): void {
  if (isPortalReturnUrlIgnoredDuringCapture(url)) {
    logWalletStep('wallet-home', 'issuer-portal-return-ignored', {
      source,
      ...describeIssuanceCallbackForLog(url),
    })
    return
  }

  lastNotifiedUrl = url
  logWalletStep('wallet-home', 'issuer-portal-return-notified', {
    source,
    ...describeIssuanceCallbackForLog(url),
  })
  if (activeWaiter) {
    const waiter = activeWaiter
    activeWaiter = null
    waiter.resolve(url)
  }
}

export function readLastNotifiedPortalReturnUrl(): string | undefined {
  return lastNotifiedUrl
}

export function waitForPortalReturnNotification(
  timeoutMs: number,
  options: {
    onHeartbeat?: (elapsedMs: number) => void
    heartbeatMs?: number
    poll?: () => string | undefined | Promise<string | undefined>
    pollMs?: number
  } = {},
): Promise<string | undefined> {
  if (lastNotifiedUrl) {
    const url = lastNotifiedUrl
    return Promise.resolve(url)
  }

  const heartbeatMs = options.heartbeatMs ?? 3000
  const pollMs = options.pollMs ?? 1000

  return new Promise((resolve) => {
    const started = Date.now()

    const timer = setTimeout(() => {
      cleanup()
      resolve(undefined)
    }, timeoutMs)

    const heartbeat = setInterval(() => {
      options.onHeartbeat?.(Date.now() - started)
    }, heartbeatMs)

    const pollTimer = options.poll
      ? setInterval(() => {
        void Promise.resolve(options.poll?.()).then((url) => {
          if (url) {
            notifyPortalReturnUrl(url, 'poll')
          }
        })
      }, pollMs)
      : undefined

    function cleanup() {
      clearTimeout(timer)
      clearInterval(heartbeat)
      if (pollTimer) clearInterval(pollTimer)
      activeWaiter = null
    }

    activeWaiter = {
      resolve: (url) => {
        cleanup()
        resolve(url)
      },
    }
  })
}
