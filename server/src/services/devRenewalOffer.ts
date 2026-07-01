export const CREDENTIAL_TYPE_TO_ISSUER_DOCUMENT_TYPE: Record<string, string> = {
  ThaiNationalID: 'IdCard',
  DLTDrivingLicence: 'DriverLicense',
  UniversityTranscript: 'Transcript',
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function mapCredentialTypeToIssuerDocumentType(credentialType: string): string | undefined {
  return CREDENTIAL_TYPE_TO_ISSUER_DOCUMENT_TYPE[credentialType]
}

export function parseIssuerCredentialOfferResponse(
  payload: unknown,
  issuerBaseUrl: string,
): string {
  if (typeof payload === 'string') {
    const trimmed = payload.trim()
    if (trimmed.startsWith('openid-credential-offer://')) {
      return trimmed
    }
  }

  const record = readRecord(payload)
  if (!record) {
    throw new Error('IssuerCredentialOfferInvalid')
  }

  for (const key of ['offerUri', 'offer_uri', 'qr', 'qrCode', 'qr_code', 'uri']) {
    const value = record[key]
    if (typeof value === 'string' && value.startsWith('openid-credential-offer://')) {
      return value
    }
  }

  const nestedOffer = record.credential_offer ?? record.credentialOffer
  if (readRecord(nestedOffer)) {
    const params = new URLSearchParams({
      credential_offer: JSON.stringify(nestedOffer),
    })
    return `openid-credential-offer://?${params.toString()}`
  }

  const offerId = record.id ?? record.offerId ?? record.offer_id
  if (typeof offerId === 'string' && offerId.length > 0) {
    const credentialOfferUri = `${issuerBaseUrl.replace(/\/$/, '')}/openid4vc/credentialOffer?id=${encodeURIComponent(offerId)}`
    const params = new URLSearchParams({
      credential_offer_uri: credentialOfferUri,
    })
    return `openid-credential-offer://?${params.toString()}`
  }

  throw new Error('IssuerCredentialOfferUnrecognized')
}

export type RequestIssuerRenewalOfferDependencies = {
  fetchImpl?: typeof fetch
  issuerTarget?: string
}

export async function requestIssuerRenewalOffer(
  credentialType: string,
  dependencies: RequestIssuerRenewalOfferDependencies = {},
): Promise<string> {
  const issuerTarget = (dependencies.issuerTarget ?? process.env.ISSUER_PROXY_TARGET)?.replace(
    /\/$/,
    '',
  )
  if (!issuerTarget) {
    throw new Error('IssuerProxyTargetMissing')
  }

  const documentType = mapCredentialTypeToIssuerDocumentType(credentialType)
  if (!documentType) {
    throw new Error(`UnsupportedCredentialType: ${credentialType}`)
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch
  const response = await fetchImpl(`${issuerTarget}/credential-offer`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ document_type: documentType }),
  })

  if (!response.ok) {
    throw new Error(`IssuerCredentialOfferFailed: HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.toLowerCase().includes('application/json')) {
    const payload = await response.json()
    return parseIssuerCredentialOfferResponse(payload, issuerTarget)
  }

  const text = (await response.text()).trim()
  if (text.startsWith('openid-credential-offer://')) {
    return text
  }

  try {
    return parseIssuerCredentialOfferResponse(JSON.parse(text), issuerTarget)
  } catch {
    throw new Error('IssuerCredentialOfferUnrecognized')
  }
}

export function isParseableCredentialOfferUri(offerUri: string): boolean {
  try {
    const parsed = new URL(offerUri)
    if (parsed.protocol !== 'openid-credential-offer:') return false
    return (
      parsed.searchParams.has('credential_offer') || parsed.searchParams.has('credential_offer_uri')
    )
  } catch {
    return false
  }
}
