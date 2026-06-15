import { ed25519 } from '@noble/curves/ed25519.js'
import { createHash } from 'react-native-quick-crypto'

import { describePresentationAttempt } from './presentationDiagnostics'
import type { ResolvedPresentationRequest } from './presentationService'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function encode(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function jwt(header: Record<string, unknown>, payload: Record<string, unknown>): string {
  return `${encode(header)}.${encode(payload)}.signature`
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64UrlEncodeDigest(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  return base64UrlEncodeBytes(bytes)
}

function base58btcEncode(bytes: Uint8Array): string {
  let leadingOnes = 0
  for (const b of bytes) {
    if (b !== 0) break
    leadingOnes++
  }

  let n = 0n
  for (const b of bytes) n = (n << 8n) | BigInt(b)

  let result = ''
  while (n > 0n) {
    const rem = Number(n % 58n)
    result = BASE58_ALPHABET[rem] + result
    n = n / 58n
  }

  return '1'.repeat(leadingOnes) + result
}

function ed25519DidKey(publicKey: Uint8Array): string {
  const prefixed = new Uint8Array(34)
  prefixed.set([0xed, 0x01])
  prefixed.set(publicKey, 2)
  return `did:key:z${base58btcEncode(prefixed)}`
}

test('describes SD-JWT KB presentation metadata without full token contents', () => {
  const issuerJwt = jwt(
    { alg: 'EdDSA', typ: 'dc+sd-jwt', kid: 'did:key:z6MkIssuer' },
    {
      vct: 'http://192.100.10.49/credentials/TranscriptCredential',
      cnf: { kid: 'did:key:z6MkWallet' },
      hidden: 'do-not-include',
    },
  )
  const kbJwt = jwt(
    { alg: 'EdDSA', typ: 'kb+jwt', kid: 'did:key:z6MkWallet' },
    {
      aud: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      sd_hash: 'hash',
    },
  )

  const summary = describePresentationAttempt({
    request: {
      clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
      responseUri: 'http://192.100.10.48/openid4vc/verify/request-123',
      nonce: 'request-123',
      dcqlQuery: {
        credentials: [
          {
            id: 'transcript_credential',
            format: 'dc+sd-jwt',
            meta: { vct_values: ['http://192.100.10.49/credentials/TranscriptCredential'] },
          },
        ],
      },
      matchedCredential: {
        id: 'credential-1',
        type: 'BangkokUniversityTranscript',
        rawVc: issuerJwt,
        claims: {},
        issuedAt: '2026-06-12T00:00:00.000Z',
      },
    } as ResolvedPresentationRequest,
    vpToken: `${issuerJwt}~disclosure~${kbJwt}`,
  })

  expect(summary).toContain('dcql_ids=transcript_credential')
  expect(summary).toContain('requested_vct=http://192.100.10.49/credentials/TranscriptCredential')
  expect(summary).toContain('credential_vct=http://192.100.10.49/credentials/TranscriptCredential')
  expect(summary).toContain('credential_cnf_kid=did:key:z6MkWallet')
  expect(summary).toContain('kb_header_alg=EdDSA')
  expect(summary).toContain('kb_header_kid=did:key:z6MkWallet')
  expect(summary).toContain('kb_header_jwk=none')
  expect(summary).toContain('kb_aud_matches_client_id=true')
  expect(summary).toContain('kb_nonce_matches_request=true')
  expect(summary).toContain('kb_sd_hash_present=true')
  expect(summary).not.toContain('do-not-include')
  expect(summary).not.toContain('~disclosure~')
})

test('describes local SD-JWT KB validity checks without exposing token contents', () => {
  const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(11_000)
  const secretKey = new Uint8Array(32).fill(7)
  const did = ed25519DidKey(ed25519.getPublicKey(secretKey))
  const issuerJwt = jwt(
    { alg: 'EdDSA', typ: 'dc+sd-jwt', kid: 'did:key:z6MkIssuer' },
    {
      vct: 'http://192.100.10.46/credentials/IDCard',
      cnf: { kid: did },
      hidden: 'do-not-include',
    },
  )
  const sdJwtWithoutKb = `${issuerJwt}~disclosure~`
  const sdHash = base64UrlEncodeDigest(createHash('sha256').update(new TextEncoder().encode(sdJwtWithoutKb)).digest())
  const kbHeader = { alg: 'EdDSA', typ: 'kb+jwt', kid: did }
  const kbPayload = {
    aud: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
    nonce: 'request-123',
    iat: 1,
    sd_hash: sdHash,
  }
  const signingInput = `${encode(kbHeader)}.${encode(kbPayload)}`
  const kbJwt = `${signingInput}.${base64UrlEncodeBytes(ed25519.sign(new TextEncoder().encode(signingInput), secretKey))}`

  try {
    const summary = describePresentationAttempt({
      request: {
        clientId: 'redirect_uri:http://192.100.10.48/openid4vc/verify/request-123',
        responseUri: 'http://192.100.10.48/openid4vc/verify/request-123',
        nonce: 'request-123',
        state: 'request-123',
        dcqlQuery: {
          credentials: [
            {
              id: 'idcard_credential',
              format: 'dc+sd-jwt',
              meta: { vct_values: ['http://192.100.10.46/credentials/IDCard'] },
            },
          ],
        },
        matchedCredential: {
          id: 'credential-1',
          type: 'ThaiNationalID',
          rawVc: issuerJwt,
          claims: {},
          issuedAt: '2026-06-12T00:00:00.000Z',
        },
      } as ResolvedPresentationRequest,
      vpToken: `${sdJwtWithoutKb}${kbJwt}`,
    })

    expect(summary).toContain('vp_token_response_shape=object_array')
    expect(summary).toContain('state_present=true')
    expect(summary).toContain('sdjwt_disclosure_count=1')
    expect(summary).toContain('sdjwt_has_trailing_separator_before_kb=true')
    expect(summary).toContain('kb_sd_hash_matches=true')
    expect(summary).toContain('kb_signature_self_verifies=true')
    expect(summary).toContain('kb_iat_age_seconds=10')
    expect(summary).not.toContain('do-not-include')
    expect(summary).not.toContain('~disclosure~')
  } finally {
    nowSpy.mockRestore()
  }
})
