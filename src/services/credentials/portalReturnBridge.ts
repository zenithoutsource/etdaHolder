import { logWalletStep } from '../debug/walletLogger'
import { readWalletReturnUrl } from '../../config/sameDeviceIssuance'
import { describeIssuanceCallbackForLog } from './describeIssuanceCallbackForLog'
import { parseIssuanceCallbackUrl } from './parseIssuanceCallbackUrl'

type PortalReturnWaiter = {
  generation: number
  resolve: (url: string | undefined) => void
}

let captureGeneration = 0
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
 *
 * Returns a capture generation. A newer beginPortalReturnCapture() supersedes
 * older waits so a retry cannot leave a stale timeout that later shows
 * "ยังไม่ได้รับเอกสาร" after the second attempt already succeeded.
 */
export function beginPortalReturnCapture(input: {
  ignoredUrls?: readonly string[]
  ignoredUris?: readonly string[]
} = {}): number {
  const previousWaiter = activeWaiter
  activeWaiter = null
  lastNotifiedUrl = undefined
  captureGeneration += 1
  activeCapture = {
    ignoredUrls: new Set(input.ignoredUrls ?? []),
    ignoredUris: new Set(input.ignoredUris ?? []),
  }

  if (previousWaiter) {
    logWalletStep('wallet-home', 'issuer-portal-return-wait-superseded', {
      previousGeneration: previousWaiter.generation,
      nextGeneration: captureGeneration,
    })
    previousWaiter.resolve(undefined)
  }

  return captureGeneration
}

export function readPortalReturnCaptureGeneration(): number {
  return captureGeneration
}

/**
 * Ends capture for the given generation only. Omitting generation ends whatever
 * is current (tests / teardown). A stale finally from an older portal open must
 * not clear a newer capture.
 */
export function endPortalReturnCapture(generation?: number): void {
  if (generation !== undefined && generation !== captureGeneration) {
    return
  }
  activeWaiter = null
  activeCapture = undefined
}

/**
 * Aborts the current portal wait without starting a newer capture.
 * Used when the wallet PIN session expires so issuer-portal polling cannot
 * continue on the PIN lock screen. A URL already delivered is left in place.
 */
export function cancelPortalReturnWait(): void {
  if (lastNotifiedUrl) return
  if (!activeWaiter) return

  const waiter = activeWaiter
  activeWaiter = null
  logWalletStep('wallet-unlock', 'issuer-portal-wait-cancelled', {
    generation: waiter.generation,
  })
  waiter.resolve(undefined)
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
  if (activeWaiter && activeWaiter.generation === captureGeneration) {
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
    /** Generation from beginPortalReturnCapture(); required for concurrent-safe waits. */
    captureGeneration?: number
    onHeartbeat?: (elapsedMs: number) => void
    heartbeatMs?: number
    poll?: () => string | undefined | Promise<string | undefined>
    pollMs?: number
  } = {},
): Promise<string | undefined> {
  const waitGeneration = options.captureGeneration ?? captureGeneration

  if (waitGeneration !== captureGeneration) {
    return Promise.resolve(undefined)
  }

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
        if (waitGeneration !== captureGeneration) {
          cleanup()
          resolve(undefined)
          return
        }
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
      if (activeWaiter?.generation === waitGeneration) {
        activeWaiter = null
      }
    }

    activeWaiter = {
      generation: waitGeneration,
      resolve: (url) => {
        cleanup()
        resolve(url)
      },
    }
  })
}
