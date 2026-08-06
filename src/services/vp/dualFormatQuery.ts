import type { DcqlQuery } from './presentationService'

export function readRequestedDcqlFormats(dcqlQuery: DcqlQuery): string[] {
  return [
    ...new Set(
      dcqlQuery.credentials
        .map((credential) => credential.format)
        .filter((format): format is string => typeof format === 'string' && format.length > 0),
    ),
  ]
}

export function isDualFormatDcqlRequest(dcqlQuery: DcqlQuery): boolean {
  const formats = readRequestedDcqlFormats(dcqlQuery)
  return formats.some((format) => isSdJwtDcqlFormat(format)) && formats.includes('mso_mdoc')
}

const SD_JWT_DCQL_FORMATS = new Set(['dc+sd-jwt', 'vc+sd-jwt'])

export function isSdJwtDcqlFormat(format: string | undefined): boolean {
  return typeof format === 'string' && SD_JWT_DCQL_FORMATS.has(format)
}

export function isExactDualFormatPair(dcqlQuery: DcqlQuery): boolean {
  if (dcqlQuery.credentials.length !== 2) return false

  const formats = readRequestedDcqlFormats(dcqlQuery)
  if (formats.length !== 2) return false

  const hasSdJwtFormat = formats.some((format) => isSdJwtDcqlFormat(format))
  const hasMdocFormat = formats.includes('mso_mdoc')
  return hasSdJwtFormat && hasMdocFormat
}
