import { isRecord, readString } from '@/src/utils/jwtUtils'

import type { CredentialOfferObject } from '@openid4vc/openid4vci'

const PRE_AUTHORIZED_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

function readInlineCredentialOfferFromUri(offerUri: string): Record<string, unknown> | undefined {
  try {
    const parsed = new URL(offerUri)
    const inline = parsed.searchParams.get('credential_offer')
    if (!inline) return undefined
    const decoded = JSON.parse(inline) as unknown
    return isRecord(decoded) ? decoded : undefined
  } catch {
    return undefined
  }
}

function hasPreAuthorizedGrant(grants: unknown): boolean {
  if (!isRecord(grants)) return false
  return isRecord(grants[PRE_AUTHORIZED_CODE_GRANT])
}

function hasAuthorizationCodeGrant(grants: unknown): boolean {
  if (!isRecord(grants)) return false
  return isRecord(grants.authorization_code)
}

/** Validates that an offer is supported by the @openid4vc/openid4vci protocol layer. */
export function shouldUseOid4vcVciAdapter(input: {
  offerUri?: string
  credentialOfferObject?: CredentialOfferObject
}): boolean {
  const offer = input.credentialOfferObject
    ?? (() => {
      if (!input.offerUri) return undefined
      const inline = readInlineCredentialOfferFromUri(input.offerUri)
      if (!inline) return undefined
      return inline as CredentialOfferObject
    })()

  if (!offer) {
    return Boolean(input.offerUri?.includes('credential_offer_uri='))
  }

  if (!hasPreAuthorizedGrant(offer.grants) && !hasAuthorizationCodeGrant(offer.grants)) {
    return false
  }

  const configurationIds = offer.credential_configuration_ids ?? []
  if (configurationIds.length === 0) return false

  const issuer = readString(offer.credential_issuer)
  if (!issuer) return false

  return true
}

export function buildAuthorizationCodeCredentialOfferObject(input: {
  issuer: string
  credentialConfigurationIds: readonly string[]
}): CredentialOfferObject {
  return {
    credential_issuer: input.issuer as CredentialOfferObject['credential_issuer'],
    credential_configuration_ids: [...input.credentialConfigurationIds],
    grants: {
      authorization_code: {},
    },
  }
}
