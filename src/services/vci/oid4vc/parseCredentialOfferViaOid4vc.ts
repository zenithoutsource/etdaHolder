import type { CredentialOfferObject } from '@openid4vc/openid4vci'

import { toErrorMessage } from '@/src/utils/jwtUtils'

import { overlayOfferAuthorizationServer } from '../discoverAuthorizationServer'
import {
  issuerIdentifiersCompatible,
  listIssuerIdentifierCandidates,
  mapIssuerMetadataClientError,
} from '../discoverIssuerMetadata'
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
  const fetchImpl = options?.fetchImpl ?? fetch
  const client = createOid4vcVciClient({ fetchImpl })
  let lastError: unknown

  for (const candidate of listIssuerIdentifierCandidates(issuer)) {
    try {
      const issuerMetadataResult = await client.resolveIssuerMetadata(candidate)
      const metadataIssuer = issuerMetadataResult.credentialIssuer.credential_issuer
      if (typeof metadataIssuer === 'string' && issuerIdentifiersCompatible(issuer, metadataIssuer)) {
        return {
          issuerMetadataResult: await overlayOfferAuthorizationServer(
            issuer,
            issuerMetadataResult,
            fetchImpl,
          ),
        }
      }
      lastError = new Error(
        'IssuerMetadataMismatch: credential_issuer does not match the credential offer issuer',
      )
    } catch (error) {
      lastError = error
    }
  }

  throw mapIssuerMetadataClientError(lastError)
}
