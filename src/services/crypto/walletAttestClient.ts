import { readMobileRuntimeEndpoint } from '@/src/config/runtimeEndpoints'
import { readWalletAttestFetchTimeoutMs } from '@/src/config/walletCryptoPolicy'
import { getConfiguredWalletApiBaseUrl } from '@/src/sdk/installWalletApiFetch'

import { logWalletError, logWalletStep } from '../debug/walletLogger'

import type { EcP256Jwk } from './hardwareEcdsaTypes'

const DEFAULT_WALLET_PROVIDER_BASE_URL = 'http://localhost:4000'

export type WalletAttestation = {
  wua: string
  wia: string
  expiresAt: string
}

export type WalletAttestationChallenge = {
  challengeId: string
  attestationChallengeBase64: string
  expiresAt: string
}

export type WalletAttestationRequest = {
  challengeId: string
  pubKAttestJwk: EcP256Jwk
  certificateChainDerBase64: string[]
  submissionIdempotencyKey: string
}

export function resolveWalletProviderBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL?.trim()
  const defaultUrl = __DEV__ ? DEFAULT_WALLET_PROVIDER_BASE_URL : getConfiguredWalletApiBaseUrl()
  return readMobileRuntimeEndpoint(
    'WALLET_PROVIDER_BASE_URL',
    override || defaultUrl,
    { requiredInRelease: true, allowHttpInDev: true },
  )
}

function parseAttestationResponse(body: unknown): WalletAttestation {
  if (!body || typeof body !== 'object') {
    throw new Error('WalletAttestResponseInvalid')
  }
  const record = body as Record<string, unknown>
  if (
    typeof record.wua !== 'string' ||
    typeof record.wia !== 'string' ||
    typeof record.expiresAt !== 'string'
  ) {
    throw new Error('WalletAttestResponseInvalid')
  }
  return {
    wua: record.wua,
    wia: record.wia,
    expiresAt: record.expiresAt,
  }
}

function parseChallengeResponse(body: unknown): WalletAttestationChallenge {
  if (!body || typeof body !== 'object') {
    throw new Error('WalletAttestChallengeInvalid')
  }
  const record = body as Record<string, unknown>
  if (
    typeof record.challengeId !== 'string' ||
    record.challengeId.length === 0 ||
    typeof record.attestationChallengeBase64 !== 'string' ||
    record.attestationChallengeBase64.length === 0 ||
    typeof record.expiresAt !== 'string'
  ) {
    throw new Error('WalletAttestChallengeInvalid')
  }
  return {
    challengeId: record.challengeId,
    attestationChallengeBase64: record.attestationChallengeBase64,
    expiresAt: record.expiresAt,
  }
}

export class WalletAttestChallengeNotFoundError extends Error {
  readonly status = 404

  constructor() {
    super('WalletAttestChallengeNotFound:404')
    this.name = 'WalletAttestChallengeNotFound'
  }
}

export function isWalletAttestChallengeNotFound(error: unknown): boolean {
  if (error instanceof WalletAttestChallengeNotFoundError) return true
  if (error instanceof Error && error.message.startsWith('WalletAttestChallengeNotFound')) return true
  return readHttpStatus(error) === 404
}

function readHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  if ('status' in error && typeof (error as { status?: unknown }).status === 'number') {
    return (error as { status: number }).status
  }
  if (error instanceof Error) {
    const match = /:(\d{3})$/.exec(error.message)
    if (match?.[1]) return Number(match[1])
  }
  return undefined
}

function toChallengeNotFoundError(): WalletAttestChallengeNotFoundError {
  return new WalletAttestChallengeNotFoundError()
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  return (error as { name?: unknown }).name === 'AbortError'
}

async function postJson(url: string, body: unknown = {}): Promise<Response> {
  const timeoutMs = readWalletAttestFetchTimeoutMs()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

export function createWalletAttestClient(baseUrl?: string) {
  const resolvedBaseUrl = (baseUrl ?? resolveWalletProviderBaseUrl()).replace(/\/$/, '')

  return {
    async requestAttestationChallenge(): Promise<WalletAttestationChallenge> {
      const url = `${resolvedBaseUrl}/wallet-api/wallet-attestations/challenge`
      logWalletStep('crypto', 'wallet-attest-challenge-start', { url })

      let response: Response
      try {
        response = await postJson(url)
      } catch (error) {
        if (readHttpStatus(error) === 404) {
          const mapped = toChallengeNotFoundError()
          logWalletStep('crypto', 'wallet-attest-challenge-not-found', { url, status: 404 })
          throw mapped
        }
        if (isAbortError(error)) {
          const timeoutError = new Error('WalletAttestChallengeFailed: timeout')
          logWalletError('crypto', 'wallet-attest-challenge-failed', timeoutError, { url })
          throw timeoutError
        }
        logWalletError('crypto', 'wallet-attest-challenge-failed', error, { url })
        throw error
      }

      if (response.status === 404) {
        const error = toChallengeNotFoundError()
        logWalletStep('crypto', 'wallet-attest-challenge-not-found', { url, status: 404 })
        throw error
      }

      if (!response.ok) {
        const error = new Error(`WalletAttestChallengeFailed:${response.status}`)
        logWalletError('crypto', 'wallet-attest-challenge-failed', error, { url, status: response.status })
        throw error
      }

      const challenge = parseChallengeResponse((await response.json()) as unknown)
      logWalletStep('crypto', 'wallet-attest-challenge-complete', { expiresAt: challenge.expiresAt })
      return challenge
    },

    async requestAttestations(input: WalletAttestationRequest): Promise<WalletAttestation> {
      if (input.certificateChainDerBase64.length === 0) {
        throw new Error('WalletAttestChainRequired')
      }

      const url = `${resolvedBaseUrl}/wallet-api/wallet-attestations`
      logWalletStep('crypto', 'wallet-attest-request-start', { url })

      let response: Response
      try {
        response = await postJson(url, input)
      } catch (error) {
        if (isAbortError(error)) {
          const timeoutError = new Error('WalletAttestRequestFailed: timeout')
          logWalletError('crypto', 'wallet-attest-request-failed', timeoutError, { url })
          throw timeoutError
        }
        logWalletError('crypto', 'wallet-attest-request-failed', error, { url })
        throw error
      }

      if (!response.ok) {
        const error = new Error(`WalletAttestRequestFailed:${response.status}`)
        logWalletError('crypto', 'wallet-attest-request-failed', error, { url, status: response.status })
        throw error
      }

      const attestation = parseAttestationResponse((await response.json()) as unknown)
      logWalletStep('crypto', 'wallet-attest-request-complete', { expiresAt: attestation.expiresAt })
      return attestation
    },
  }
}
