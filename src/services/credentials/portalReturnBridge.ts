import { logWalletStep } from '../debug/walletLogger'
import { describeIssuanceCallbackForLog } from './describeIssuanceCallbackForLog'

type PortalReturnWaiter = {
  resolve: (url: string) => void
}

let activeWaiter: PortalReturnWaiter | null = null
let lastNotifiedUrl: string | undefined

/**
 * Bridge for Android portal flow: Custom Tabs / Expo Router may deliver
 * walletapp://callback while openAuthSessionAsync never resolves.
 * /callback and Linking notify here so the portal opener can finish.
 */
export function beginPortalReturnCapture(): void {
  lastNotifiedUrl = undefined
  activeWaiter = null
}

export function endPortalReturnCapture(): void {
  activeWaiter = null
}

export function notifyPortalReturnUrl(url: string, source: string): void {
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
