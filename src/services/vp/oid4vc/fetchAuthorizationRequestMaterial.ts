import { isRecord, toErrorMessage } from '@/src/utils/jwtUtils'
import type { AuthorizationRequestMaterial } from './types'

function parseUrl(raw: string): URL {
  try {
    return new URL(raw)
  } catch (error) {
    throw new Error(`PresentationRequestInvalid: ${toErrorMessage(error)}`)
  }
}

export async function fetchAuthorizationRequestMaterial(
  rawRequestUri: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<AuthorizationRequestMaterial> {
  const parsed = parseUrl(rawRequestUri)
  const requestUri = parsed.searchParams.get('request_uri')

  if (requestUri) {
    const fetchImpl = options.fetchImpl ?? fetch
    const response = await fetchImpl(requestUri, {
      headers: { Accept: 'application/json, application/oauth-authz-req+jwt' },
    })
    if (!response.ok) {
      throw new Error(`PresentationRequestFetchFailed: HTTP ${response.status}`)
    }

    return {
      rawBody: await response.text(),
      requestUri,
      byValueParams: Object.fromEntries(parsed.searchParams.entries()),
    }
  }

  const byValueParams = Object.fromEntries(parsed.searchParams.entries())
  if (
    !byValueParams.presentation_definition &&
    !byValueParams.presentation_definition_uri &&
    !byValueParams.dcql_query
  ) {
    throw new Error('PresentationRequestInvalid: presentation_definition or dcql_query is required')
  }

  return { byValueParams }
}

export function readRoutingPreviewFromMaterial(material: AuthorizationRequestMaterial): Record<string, unknown> {
  if (material.rawBody?.trim()) {
    const trimmed = material.rawBody.trim()
    if (trimmed.includes('.') && trimmed.split('.').length >= 2) {
      try {
        const payloadSegment = trimmed.split('.')[1]
        if (payloadSegment) {
          const json = Buffer.from(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
          const parsed = JSON.parse(json) as unknown
          if (isRecord(parsed)) return parsed
        }
      } catch {
        // fall through to JSON body parse
      }
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (isRecord(parsed)) return parsed
    } catch {
      // fall through
    }
  }

  if (material.byValueParams) {
    return { ...material.byValueParams }
  }

  return {}
}
