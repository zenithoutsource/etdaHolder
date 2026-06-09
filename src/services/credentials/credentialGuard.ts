import type { VerifiableCredentialRecord } from '../vci/exchangeService'

const PID_CREDENTIAL_TYPE = 'ThaiNationalID'
const PID_OFFER_IDS = new Set(['thainationalid', 'idcard'])

type ResolvedOfferLike = {
  credentialConfigurations: { id: string }[]
}

export function hasPidCredential(credentials: VerifiableCredentialRecord[]): boolean {
  return credentials.some((c) => c.type === PID_CREDENTIAL_TYPE)
}

export function isPidCredentialOffer(offer: ResolvedOfferLike): boolean {
  return offer.credentialConfigurations.some((configuration) => {
    const normalized = configuration.id.toLowerCase()
    return PID_OFFER_IDS.has(normalized) || normalized.includes('idcard')
  })
}

export function canRequestCredentialType(
  credentialType: string | undefined,
  credentials: VerifiableCredentialRecord[],
): boolean {
  if (credentialType === PID_CREDENTIAL_TYPE) return true
  return hasPidCredential(credentials)
}
