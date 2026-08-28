/**
 * RFC 9901 SD-JWT disclosure decoding for wallet claim display and storage.
 */

import { createHash } from 'react-native-quick-crypto'

import { base64UrlDecodeToString, decodeJwtPayload, isRecord } from '@/src/utils/jwtUtils'

const ARRAY_PLACEHOLDER_KEY = '...'

export function decodeSdJwtDisclosedClaims(compactSdJwt: string): Record<string, unknown> {
  const [issuerJwt, ...segments] = compactSdJwt.split('~')
  if (!issuerJwt) return {}

  const issuerPayload = decodeJwtPayload(issuerJwt) ?? {}
  const disclosureSegments = readDisclosureSegments(segments)
  if (disclosureSegments.length === 0) return omitSdMetadata({ ...issuerPayload })

  const sdAlg = readSdAlg(issuerPayload)
  const disclosureMap = buildDisclosureMap(disclosureSegments, sdAlg)

  if (!usesNestedSelectiveDisclosure(issuerPayload, disclosureMap)) {
    return omitSdMetadata({
      ...issuerPayload,
      ...decodeFlatDisclosureClaims(disclosureSegments),
    })
  }

  const disclosed = discloseObject(issuerPayload, disclosureMap)
  return omitSdMetadata(disclosed)
}

function readDisclosureSegments(segments: string[]): string[] {
  return segments.filter((segment) => segment.length > 0 && segment.split('.').length !== 3)
}

function readSdAlg(payload: Record<string, unknown>): string {
  const alg = payload._sd_alg
  return typeof alg === 'string' && alg.trim().length > 0 ? alg : 'sha-256'
}

function usesNestedSelectiveDisclosure(
  payload: Record<string, unknown>,
  disclosureMap: Map<string, unknown[]>,
): boolean {
  if (containsSdDigests(payload)) return true

  for (const disclosure of disclosureMap.values()) {
    if (disclosure.length === 2 && isRecord(disclosure[1]) && containsSdDigests(disclosure[1])) {
      return true
    }
    if (disclosure.length >= 3 && containsSdDigests(disclosure[2])) return true
  }

  return false
}

function containsSdDigests(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => {
      if (isRecord(entry) && ARRAY_PLACEHOLDER_KEY in entry) return true
      return containsSdDigests(entry)
    })
  }

  if (!isRecord(value)) return false
  if (Array.isArray(value._sd)) return true

  return Object.entries(value).some(([key, entry]) => {
    if (key === '_sd_alg') return false
    return containsSdDigests(entry)
  })
}

function buildDisclosureMap(segments: string[], sdAlg: string): Map<string, unknown[]> {
  const map = new Map<string, unknown[]>()

  for (const segment of segments) {
    try {
      const parsed = JSON.parse(base64UrlDecodeToString(segment)) as unknown
      if (!Array.isArray(parsed)) continue
      map.set(computeDisclosureDigest(segment, sdAlg), parsed)
    } catch {
      // Ignore malformed disclosure segments; signed issuer payload is still retained.
    }
  }

  return map
}

function computeDisclosureDigest(disclosureSegment: string, sdAlg: string): string {
  if (sdAlg !== 'sha-256') {
    throw new Error(`SdJwtDisclosureUnsupportedAlg: ${sdAlg}`)
  }

  return createHash('sha256').update(disclosureSegment, 'latin1').digest('base64url')
}

function decodeFlatDisclosureClaims(segments: string[]): Record<string, unknown> {
  const claims: Record<string, unknown> = {}

  for (const segment of segments) {
    try {
      const disclosure = JSON.parse(base64UrlDecodeToString(segment)) as unknown
      if (
        Array.isArray(disclosure) &&
        disclosure.length >= 3 &&
        typeof disclosure[1] === 'string'
      ) {
        claims[disclosure[1]] = disclosure[2]
      }
    } catch {
      // Ignore malformed disclosure segments.
    }
  }

  return claims
}

function discloseObject(
  value: Record<string, unknown>,
  disclosureMap: Map<string, unknown[]>,
): Record<string, unknown> {
  const disclosed: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value)) {
    if (key === '_sd' || key === '_sd_alg') continue
    disclosed[key] = discloseValue(entry, disclosureMap)
  }

  const sdDigests = value._sd
  if (Array.isArray(sdDigests)) {
    for (const digest of sdDigests) {
      if (typeof digest !== 'string') continue
      applyObjectPropertyDisclosure(disclosed, digest, disclosureMap)
    }
  }

  return disclosed
}

function discloseValue(value: unknown, disclosureMap: Map<string, unknown[]>): unknown {
  if (typeof value === 'string' && disclosureMap.has(value)) {
    return discloseFromDigest(value, disclosureMap)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (isRecord(entry) && Object.keys(entry).length === 1 && ARRAY_PLACEHOLDER_KEY in entry) {
        const digest = entry[ARRAY_PLACEHOLDER_KEY]
        if (typeof digest === 'string') {
          return discloseFromDigest(digest, disclosureMap)
        }
      }
      return discloseValue(entry, disclosureMap)
    })
  }

  if (isRecord(value)) {
    return discloseObject(value, disclosureMap)
  }

  return value
}

function applyObjectPropertyDisclosure(
  target: Record<string, unknown>,
  digest: string,
  disclosureMap: Map<string, unknown[]>,
): void {
  const disclosure = disclosureMap.get(digest)
  if (!disclosure || disclosure.length < 3 || typeof disclosure[1] !== 'string') return

  target[disclosure[1]] = discloseValue(disclosure[2], disclosureMap)
}

function discloseFromDigest(digest: string, disclosureMap: Map<string, unknown[]>): unknown {
  const disclosure = disclosureMap.get(digest)
  if (!disclosure) return undefined

  if (disclosure.length === 2) {
    return discloseValue(disclosure[1], disclosureMap)
  }

  if (disclosure.length >= 3 && typeof disclosure[1] === 'string') {
    return discloseValue(disclosure[2], disclosureMap)
  }

  return undefined
}

function omitSdMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}

  for (const [key, entry] of Object.entries(value)) {
    if (key === '_sd' || key === '_sd_alg') continue
    cleaned[key] = stripSdMetadataDeep(entry)
  }

  return cleaned
}

function stripSdMetadataDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stripSdMetadataDeep(entry))
  }

  if (!isRecord(value)) return value

  const cleaned: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (key === '_sd' || key === '_sd_alg') continue
    cleaned[key] = stripSdMetadataDeep(entry)
  }
  return cleaned
}
