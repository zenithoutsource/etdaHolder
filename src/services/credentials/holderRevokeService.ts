import { getHolderDid, signHolderStatusChangePop } from '../crypto/crypto'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

const DEV_HOLDER_REVOKE_NONCE_ENDPOINT = '/wallet-api/dev/issuer/holder-revoke/nonce'
const DEV_HOLDER_REVOKE_ENDPOINT = '/wallet-api/dev/issuer/holder-revoke'

export class HolderRevokeRejectedError extends Error {
  constructor(message = 'HolderRevokeRejected') {
    super(message)
    this.name = 'HolderRevokeRejectedError'
  }
}

export class HolderRevokeNetworkError extends Error {
  constructor(message = 'HolderRevokeNetworkError') {
    super(message)
    this.name = 'HolderRevokeNetworkError'
  }
}

export class HolderRevokeSigningCancelledError extends Error {
  constructor(message = 'HolderRevokeSigningCancelled') {
    super(message)
    this.name = 'HolderRevokeSigningCancelledError'
  }
}

type HolderRevokeResponse = {
  status?: string
  credentialId?: string
  confirmedAt?: string
}

type HolderRevokeNonceResponse = {
  nonce?: string
  audience?: string
  expiresAt?: string
}

type HolderRevokeDependencies = {
  fetchImpl: typeof fetch
  getHolderDid: () => string
  signHolderStatusChangePop: typeof signHolderStatusChangePop
}

function resolveDependencies(
  dependencies: Partial<HolderRevokeDependencies> = {},
): HolderRevokeDependencies {
  return {
    fetchImpl: fetch,
    getHolderDid,
    signHolderStatusChangePop,
    ...dependencies,
  }
}

function isSigningCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message === 'WalletKeySigningCancelled'
}

async function requestHolderRevokeNonce(
  credentialId: string,
  holderDid: string,
  fetchImpl: typeof fetch,
): Promise<{ nonce: string; audience: string }> {
  let response: Response
  try {
    response = await fetchImpl(DEV_HOLDER_REVOKE_NONCE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId, holderDid }),
    })
  } catch (error) {
    logWalletError('holder-revoke', 'nonce-network-failed', error, { credentialId })
    throw new HolderRevokeNetworkError()
  }

  if (!response.ok) {
    logWalletError(
      'holder-revoke',
      'nonce-rejected',
      new Error(`HTTP ${response.status}`),
      { credentialId, status: response.status },
    )
    throw new HolderRevokeRejectedError('HolderRevokeNonceRejected')
  }

  let body: HolderRevokeNonceResponse
  try {
    body = (await response.json()) as HolderRevokeNonceResponse
  } catch (error) {
    logWalletError('holder-revoke', 'nonce-invalid-response', error, { credentialId })
    throw new HolderRevokeRejectedError('HolderRevokeNonceInvalidResponse')
  }

  if (typeof body.nonce !== 'string' || typeof body.audience !== 'string') {
    logWalletError(
      'holder-revoke',
      'nonce-invalid-response',
      new Error('Missing nonce or audience'),
      { credentialId },
    )
    throw new HolderRevokeRejectedError('HolderRevokeNonceInvalidResponse')
  }

  logWalletStep('holder-revoke', 'nonce-received', { credentialId })
  return { nonce: body.nonce, audience: body.audience }
}

export async function submitHolderRevokeRequest(
  credentialId: string,
  dependencies: Partial<HolderRevokeDependencies> = {},
): Promise<{ status: 'revoked'; confirmedAt: string }> {
  const { fetchImpl, getHolderDid: readHolderDid, signHolderStatusChangePop: signPop } =
    resolveDependencies(dependencies)
  const holderDid = readHolderDid()

  const { nonce, audience } = await requestHolderRevokeNonce(credentialId, holderDid, fetchImpl)

  let popJwt: string
  try {
    popJwt = await signPop({ nonce, audience, credentialId, action: 'revoke' })
  } catch (error) {
    if (isSigningCancellation(error)) {
      logWalletError('holder-revoke', 'signing-cancelled', error, { credentialId })
      throw new HolderRevokeSigningCancelledError()
    }
    logWalletError('holder-revoke', 'signing-failed', error, { credentialId })
    throw new HolderRevokeRejectedError('HolderRevokeSigningFailed')
  }

  let response: Response
  try {
    response = await fetchImpl(DEV_HOLDER_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId, holderDid, popJwt }),
    })
  } catch (error) {
    logWalletError('holder-revoke', 'network-failed', error, { credentialId })
    throw new HolderRevokeNetworkError()
  }

  if (!response.ok) {
    logWalletError(
      'holder-revoke',
      'issuer-rejected',
      new Error(`HTTP ${response.status}`),
      { credentialId, status: response.status },
    )
    throw new HolderRevokeRejectedError()
  }

  let body: HolderRevokeResponse
  try {
    body = (await response.json()) as HolderRevokeResponse
  } catch (error) {
    logWalletError('holder-revoke', 'invalid-response', error, { credentialId })
    throw new HolderRevokeRejectedError('HolderRevokeInvalidResponse')
  }

  if (body.status !== 'revoked' || typeof body.confirmedAt !== 'string') {
    logWalletError(
      'holder-revoke',
      'invalid-response',
      new Error('Missing revoked confirmation fields'),
      { credentialId },
    )
    throw new HolderRevokeRejectedError('HolderRevokeInvalidResponse')
  }

  logWalletStep('holder-revoke', 'issuer-confirmed', { credentialId })
  return { status: 'revoked', confirmedAt: body.confirmedAt }
}
