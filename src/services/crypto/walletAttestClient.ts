import { readMobileRuntimeEndpoint } from '@/src/config/runtimeEndpoints'

import { logWalletError, logWalletStep } from '../debug/walletLogger'

const DEFAULT_WALLET_PROVIDER_BASE_URL = 'http://localhost:4000'

export type WalletAttestation = {
  wua: string
  wia: string
  expiresAt: string
}

export function resolveWalletProviderBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_WALLET_PROVIDER_BASE_URL?.trim()
  return readMobileRuntimeEndpoint(
    'WALLET_PROVIDER_BASE_URL',
    override || (__DEV__ ? DEFAULT_WALLET_PROVIDER_BASE_URL : undefined),
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

export function createWalletAttestClient(baseUrl?: string) {
  const resolvedBaseUrl = (baseUrl ?? resolveWalletProviderBaseUrl()).replace(/\/$/, '')

  return {
    async requestAttestations(input: { pubKAttestJwk: JsonWebKey }): Promise<WalletAttestation> {
      const url = `${resolvedBaseUrl}/v1/wallet-attestations`
      logWalletStep('crypto', 'wallet-attest-request-start', { url })

      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ pubKAttestJwk: input.pubKAttestJwk }),
        })
      } catch (error) {
        logWalletError('crypto', 'wallet-attest-request-failed', error, { url })
        throw error
      }

      if (!response.ok) {
        const error = new Error(`WalletAttestRequestFailed:${response.status}`)
        logWalletError('crypto', 'wallet-attest-request-failed', error, { url, status: response.status })
        throw error
      }

      const body = (await response.json()) as unknown
      const attestation = parseAttestationResponse(body)
      logWalletStep('crypto', 'wallet-attest-request-complete', { expiresAt: attestation.expiresAt })
      return attestation
    },
  }
}
