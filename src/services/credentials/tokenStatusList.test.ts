import {
  formatTokenStatusListProbeSummary,
  probeTokenStatusList,
  readTokenStatusListRef,
  readTokenStatusListRefFromSdJwt,
} from './tokenStatusList'

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function statusListJwt(payload: Record<string, unknown>): string {
  const header = encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'statuslist+jwt' }))
  const body = encodeBase64Url(JSON.stringify(payload))
  return `${header}.${body}.`
}

// Appendix C 1-bit status list (draft-ietf-oauth-status-list test vector).
const SPEC_LST_ONE_BIT =
  'eNrt3AENwCAMAEGogklACtKQPg9LugC9k_ACvreiogEAAKkeCQAAAAAAAAAAAAAAAAAAAIBylgQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXG9IAAAAAAAAAPwsJAAAAAAAAAAAAAAAvhsSAAAAAAAAAAAA7KpLAAAAAAAAAAAAAAAAAAAAAJsLCQAAAAAAAAAAADjelAAAAAAAAAAAKjDMAQAAAACAZC8L2AEb'

describe('tokenStatusList', () => {
  test('reads status list reference from issuer payload', () => {
    const ref = readTokenStatusListRef({
      status: {
        status_list: {
          uri: 'https://issuer.example/status/1',
          idx: 67,
        },
      },
    })

    expect(ref).toEqual({ uri: 'https://issuer.example/status/1', idx: 67 })
  })

  test('reads status list reference from SD-JWT issuer JWT', () => {
    const issuerJwt = `${encodeBase64Url(JSON.stringify({ alg: 'ES256', typ: 'dc+sd-jwt' }))}.${encodeBase64Url(JSON.stringify({
      status: { status_list: { uri: 'https://issuer.example/status/2', idx: 3 } },
    }))}.sig`
    const ref = readTokenStatusListRefFromSdJwt(`${issuerJwt}~disclosure~`)
    expect(ref).toEqual({ uri: 'https://issuer.example/status/2', idx: 3 })
  })

  test('extracts status values from a one-bit list', () => {
    const bitstring = probeInternals.decompress(SPEC_LST_ONE_BIT)
    expect(probeInternals.read(bitstring, 0, 1)).toBe(1)
    expect(probeInternals.read(bitstring, 1, 1)).toBe(0)
  })

  test('probe resolves VALID when idx points to a valid entry', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        statusListJwt({
          sub: 'https://issuer.example/status/1',
          status_list: { bits: 1, lst: SPEC_LST_ONE_BIT },
        }),
        { status: 200, headers: { 'Content-Type': 'application/statuslist+jwt' } },
      ),
    )

    const result = await probeTokenStatusList(
      { uri: 'https://issuer.example/status/1', idx: 1 },
      fetchImpl as unknown as typeof fetch,
    )

    expect(result).toEqual({
      state: 'resolved',
      statusCode: 0,
      statusName: 'VALID',
      isValid: true,
      bitsPerEntry: 1,
      subjectMatchesUri: true,
    })
    expect(formatTokenStatusListProbeSummary(result)).toContain('status_list_entry=VALID')
  })

  test('probe resolves INVALID when idx points to a revoked entry', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        statusListJwt({
          sub: 'https://issuer.example/status/1',
          status_list: { bits: 1, lst: SPEC_LST_ONE_BIT },
        }),
        { status: 200 },
      ),
    )

    const result = await probeTokenStatusList(
      { uri: 'https://issuer.example/status/1', idx: 0 },
      fetchImpl as unknown as typeof fetch,
    )

    expect(result.state).toBe('resolved')
    if (result.state !== 'resolved') return
    expect(result.statusName).toBe('INVALID')
    expect(result.isValid).toBe(false)
    expect(formatTokenStatusListProbeSummary(result)).toContain('status_list_entry=INVALID')
  })

  test('probe reports fetch failures', async () => {
    const fetchImpl = jest.fn(async () => new Response('', { status: 404 }))
    const result = await probeTokenStatusList(
      { uri: 'https://issuer.example/status/missing', idx: 0 },
      fetchImpl as unknown as typeof fetch,
    )
    expect(result).toEqual({ state: 'fetch_failed', httpStatus: 404, reason: 'http_404' })
  })
})

// Test-only helpers for bit extraction without widening the public API.
const probeInternals = {
  decompress(lst: string) {
    const { gunzipSync, inflateSync, unzlibSync } = require('fflate') as typeof import('fflate')
    const base64 = lst.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    try {
      return unzlibSync(bytes)
    } catch {
      try {
        return inflateSync(bytes)
      } catch {
        return gunzipSync(bytes)
      }
    }
  },
  read(bitstring: Uint8Array, idx: number, bits: number) {
    const bitPos = idx * bits
    const byteIdx = Math.floor(bitPos / 8)
    const bitOffset = bitPos % 8
    const mask = (1 << bits) - 1
    return (bitstring[byteIdx]! >> bitOffset) & mask
  },
}
