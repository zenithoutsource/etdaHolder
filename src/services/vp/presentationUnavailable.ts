import {
  isIssuerPortalCredentialType,
  type IssuerPortalCredentialType,
} from '../../config/issuerPortalUrls'
import { getCardSchema, getCardSchemaForConfigurationId } from '../../config/cardSchemas'

export type PresentationUnavailableReason = 'credential-missing' | 'metadata-mismatch'

export type PresentationUnavailableDetails = {
  reason: PresentationUnavailableReason
  documentLabel: string
  requestCredentialType?: IssuerPortalCredentialType
}

type PresentationUnavailableErrorLike = Error & {
  reason?: unknown
  requestedVctValues?: unknown
  requestedCredentialTypes?: unknown
}

export class PresentationCredentialUnavailableError extends Error {
  readonly reason: PresentationUnavailableReason
  readonly requestedVctValues: string[]
  readonly requestedCredentialTypes: string[]

  constructor(input: {
    message: string
    reason: PresentationUnavailableReason
    requestedVctValues?: string[]
    requestedCredentialTypes?: string[]
  }) {
    super(input.message)
    this.name = 'PresentationCredentialUnavailableError'
    this.reason = input.reason
    this.requestedVctValues = input.requestedVctValues ?? []
    this.requestedCredentialTypes = input.requestedCredentialTypes ?? []
  }
}

export function readPresentationUnavailableDetails(
  error: unknown,
): PresentationUnavailableDetails | undefined {
  if (!(error instanceof Error) || error.name !== 'PresentationCredentialUnavailableError') {
    return undefined
  }

  const candidate = error as PresentationUnavailableErrorLike
  if (candidate.reason !== 'credential-missing' && candidate.reason !== 'metadata-mismatch') {
    return undefined
  }

  const requestedCredentialTypes = readStringArray(candidate.requestedCredentialTypes)
  const requestedVctValues = readStringArray(candidate.requestedVctValues)
  const mappedType = requestedCredentialTypes.find(isIssuerPortalCredentialType)
    ?? requestedVctValues
      .map((value) => getCardSchemaForConfigurationId(value).type)
      .find(isIssuerPortalCredentialType)

  if (!mappedType) {
    return {
      reason: candidate.reason,
      documentLabel: 'Requested document',
    }
  }

  return {
    reason: candidate.reason,
    documentLabel: getCardSchema(mappedType).title,
    requestCredentialType: mappedType,
  }
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
