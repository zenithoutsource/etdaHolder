import { getHolderDid } from '../crypto/crypto'
import { logWalletError, logWalletStep } from '../debug/walletLogger'

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

type HolderRevokeResponse = {
  status?: string
  credentialId?: string
  confirmedAt?: string
}

type HolderRevokeDependencies = {
  fetchImpl: typeof fetch
  getHolderDid: () => string
}

function resolveDependencies(
  dependencies: Partial<HolderRevokeDependencies> = {},
): HolderRevokeDependencies {
  return {
    fetchImpl: fetch,
    getHolderDid,
    ...dependencies,
  }
}

export async function submitHolderRevokeRequest(
  credentialId: string,
  dependencies: Partial<HolderRevokeDependencies> = {},
): Promise<{ status: 'revoked'; confirmedAt: string }> {
  const { fetchImpl, getHolderDid: readHolderDid } = resolveDependencies(dependencies)
  const holderDid = readHolderDid()

  let response: Response
  try {
    response = await fetchImpl(DEV_HOLDER_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialId, holderDid }),
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
