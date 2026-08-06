import { isRecord, toErrorMessage } from '@/src/utils/jwtUtils'

function readDcqlQueryValue(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || value.trim().length === 0) return undefined

  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : undefined
  } catch (error) {
    throw new Error(`PresentationRequestInvalid: dcql_query must be valid JSON (${toErrorMessage(error)})`)
  }
}

export function normalizeAuthorizationRequestForRouting(raw: Record<string, unknown>): Record<string, unknown> {
  const dcqlQuery = readDcqlQueryValue(raw.dcql_query)
  if (!dcqlQuery) return raw
  return { ...raw, dcql_query: dcqlQuery }
}
