import type { CredentialOfferObject } from '@openid4vc/openid4vci'

import { toErrorMessage } from '@/src/utils/jwtUtils'

import { createOid4vcVciClient } from './createOid4vcVciClient'
import type { Oid4vcVciAdapterContext } from './types'

function mapOid4vcError(error: unknown): Error {
  const message = toErrorMessage(error)
  if (message.startsWith('CredentialOffer')) return new Error(message)
  return new Error(`CredentialOfferParseFailed: ${message}`)
}

export async function parseCredentialOfferViaOid4vc(
  offerUri: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<{
  credentialOfferObject: CredentialOfferObject
  oid4vcContext: Pick<Oid4vcVciAdapterContext, 'credentialOfferObject'>
}> {
  const client = createOid4vcVciClient({ fetchImpl: options?.fetchImpl })

  try {
    const credentialOfferObject = await client.resolveCredentialOffer(offerUri)
    return {
      credentialOfferObject,
      oid4vcContext: { credentialOfferObject },
    }
  } catch (error) {
    throw mapOid4vcError(error)
  }
}

export async function resolveIssuerMetadataViaOid4vc(
  issuer: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<{
  issuerMetadataResult: Oid4vcVciAdapterContext['issuerMetadataResult']
}> {
  const client = createOid4vcVciClient({ fetchImpl: options?.fetchImpl })

  try {
    const issuerMetadataResult = await client.resolveIssuerMetadata(issuer)
    return { issuerMetadataResult }
  } catch (error) {
    throw new Error(`IssuerMetadataFetchFailed: ${toErrorMessage(error)}`)
  }
}
