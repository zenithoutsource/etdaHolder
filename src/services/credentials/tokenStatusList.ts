/**
 * Token Status List probe (draft-ietf-oauth-status-list) for presentation diagnostics.
 * Fetches the issuer status list and reads the entry at the credential idx.
 */
import { gunzipSync, inflateSync, unzlibSync } from 'fflate'

import { decodeJwtPayload, isRecord, readString } from '@/src/utils/jwtUtils'

const STATUS_LIST_ACCEPT = 'application/statuslist+jwt, application/statuslist+cwt'
const MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024

export type TokenStatusListRef = {
  uri: string
  idx: number
}

export type TokenStatusListProbeResult =
  | { state: 'no_status_list' }
  | { state: 'fetch_failed'; httpStatus?: number; reason: string }
  | { state: 'probe_failed'; reason: string }
  | {
    state: 'resolved'
    statusCode: number
    statusName: 'VALID' | 'INVALID' | 'SUSPENDED' | 'UNKNOWN'
    isValid: boolean
    bitsPerEntry: number
    subjectMatchesUri: boolean
  }

export function readTokenStatusListRef(
  issuerPayload: Record<string, unknown> | undefined,
): TokenStatusListRef | undefined {
  if (!issuerPayload) return undefined
  const status = readRecord(issuerPayload.status)
  const statusList = readRecord(status?.status_list)
  const uri = readString(statusList?.uri)
  const idx = readStatusListIndex(statusList?.idx)
  if (!uri || idx === undefined) return undefined
  return { uri, idx }
}

export function readTokenStatusListRefFromSdJwt(rawSdJwt: string): TokenStatusListRef | undefined {
  const issuerJwt = rawSdJwt.split('~')[0] ?? ''
  if (!issuerJwt) return undefined
  return readTokenStatusListRef(decodeJwtPayload(issuerJwt))
}

export async function probeTokenStatusList(
  ref: TokenStatusListRef,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenStatusListProbeResult> {
  try {
    const response = await fetchImpl(ref.uri, {
      method: 'GET',
      headers: { Accept: STATUS_LIST_ACCEPT },
    })
    if (!response.ok) {
      return {
        state: 'fetch_failed',
        httpStatus: response.status,
        reason: `http_${response.status}`,
      }
    }

    const body = (await response.text()).trim()
    if (!body) {
      return { state: 'probe_failed', reason: 'empty_body' }
    }

    const payload = decodeJwtPayload(body)
    if (!payload) {
      return { state: 'probe_failed', reason: 'status_list_not_jwt' }
    }

    const statusList = readRecord(payload.status_list)
    const lst = readString(statusList?.lst)
    const bitsPerEntry = readStatusListIndex(statusList?.bits) ?? 1
    if (!lst) {
      return { state: 'probe_failed', reason: 'missing_lst' }
    }

    const subject = readString(payload.sub)
    const subjectMatchesUri = subject === ref.uri
    const bitstring = decompressStatusListBitstring(lst)
    const statusCode = extractStatusValue(bitstring, ref.idx, bitsPerEntry)
    const statusName = readStatusName(statusCode)

    return {
      state: 'resolved',
      statusCode,
      statusName,
      isValid: statusCode === 0,
      bitsPerEntry,
      subjectMatchesUri,
    }
  } catch (error) {
    return {
      state: 'probe_failed',
      reason: error instanceof Error ? error.message : 'unknown_probe_error',
    }
  }
}

export function formatTokenStatusListProbeSummary(result: TokenStatusListProbeResult): string {
  if (result.state === 'no_status_list') return 'status_list_entry=none'
  if (result.state === 'fetch_failed') {
    return `status_list_fetch=${result.reason}; status_list_entry=unknown`
  }
  if (result.state === 'probe_failed') {
    return `status_list_probe=${result.reason}; status_list_entry=unknown`
  }
  return [
    `status_list_entry=${result.statusName}`,
    `status_list_code=${result.statusCode}`,
    `status_list_bits=${result.bitsPerEntry}`,
    `status_list_sub_matches_uri=${result.subjectMatchesUri}`,
    `status_list_valid=${result.isValid}`,
  ].join('; ')
}

function readStatusListIndex(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return undefined
}

function decompressStatusListBitstring(lst: string): Uint8Array {
  const compressed = base64UrlToBytes(lst)
  try {
    return unzlibSync(compressed, { maxSize: MAX_DECOMPRESSED_BYTES })
  } catch {
    try {
      return inflateSync(compressed, { maxSize: MAX_DECOMPRESSED_BYTES })
    } catch {
      return gunzipSync(compressed, { maxSize: MAX_DECOMPRESSED_BYTES })
    }
  }
}

function extractStatusValue(bitstring: Uint8Array, idx: number, bits: number): number {
  if (idx < 0) throw new Error('negative_idx')
  if (![1, 2, 4, 8].includes(bits)) throw new Error('unsupported_bits')

  const entries = Math.floor((bitstring.length * 8) / bits)
  if (idx >= entries) throw new Error('idx_out_of_range')

  const bitPos = idx * bits
  const byteIdx = Math.floor(bitPos / 8)
  const bitOffset = bitPos % 8
  const mask = (1 << bits) - 1
  return (bitstring[byteIdx]! >> bitOffset) & mask
}

function readStatusName(statusCode: number): 'VALID' | 'INVALID' | 'SUSPENDED' | 'UNKNOWN' {
  if (statusCode === 0) return 'VALID'
  if (statusCode === 1) return 'INVALID'
  if (statusCode === 2) return 'SUSPENDED'
  return 'UNKNOWN'
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}
