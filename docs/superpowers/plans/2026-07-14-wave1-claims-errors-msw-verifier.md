# Wave 1: Claims Dedupe + OID4VP Errors + MSW + Verifier Checklist

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Wave 1 wallet backlog in one slice: shared claim formatting, Issuer OID4VP Scan error messages, MSW Verifier `direct_post` harness, and production Verifier env documentation.

**Architecture:** Extract `claimFormatting.ts` as the single claim stringify/lookup module; extend `scanFriendlyErrors.ts` with Issuer OID4VP-specific mappings (optional `:issuer` error suffix at throw sites); add opt-in MSW server under `src/__tests__/setup/` with one `presentationService` integration test; document release Verifier `did:web` env in GETTING_STARTED + `.env.example`.

**Tech Stack:** Expo SDK 54, TypeScript, Jest, MSW 2.x, Express server (unchanged for F).

**Spec:** `docs/superpowers/specs/2026-07-14-wave1-claims-errors-msw-verifier-design.md`

## Global constraints

- Do not implement per-credential `did:key`.
- Do not add Issuer notify/deeplink intake for PID failure (diagram step 17).
- MSW is test-only — no imports from `app/` or `src/services/` production paths except test files.
- English-only user strings in `scanFriendlyErrors.ts` (match existing file).
- Do not commit unless the user explicitly requests it.
- After each task: run focused tests; end with `yarn tsc --noEmit` and `yarn lint`.

## File map

| Action | Path |
|--------|------|
| Create | `src/services/credentials/claimFormatting.ts` |
| Create | `src/services/credentials/claimFormatting.test.ts` |
| Modify | `src/services/credentials/credentialDisplay.ts` |
| Modify | `src/services/vci/qrIssuanceFlow.ts` |
| Modify | `src/services/vp/presentationService.ts` |
| Modify | `src/services/vp/dcqlCredentialMatch.ts` |
| Modify | `src/services/scan/scanFriendlyErrors.ts` |
| Modify | `src/services/scan/scanFriendlyErrors.test.ts` |
| Create | `src/__tests__/setup/handlers/verifier.ts` |
| Create | `src/__tests__/setup/mswServer.ts` |
| Modify | `src/services/vp/presentationService.test.ts` |
| Modify | `.env.example` |
| Modify | `docs/GETTING_STARTED.md` |
| Modify | `docs/TASKS.md` |

---

### Task 1: `claimFormatting` module

**Files:**
- Create: `src/services/credentials/claimFormatting.ts`
- Create: `src/services/credentials/claimFormatting.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/services/credentials/claimFormatting.test.ts`:

```ts
import {
  HIDDEN_CLAIM_KEYS,
  isHiddenClaimKey,
  readClaimText,
  stringifyClaim,
} from './claimFormatting'

describe('claimFormatting', () => {
  test('stringifyClaim formats primitives and JSON', () => {
    expect(stringifyClaim('hello')).toBe('hello')
    expect(stringifyClaim(42)).toBe('42')
    expect(stringifyClaim(true)).toBe('true')
    expect(stringifyClaim(null)).toBe('')
    expect(stringifyClaim({ a: 1 })).toBe('{"a":1}')
  })

  test('isHiddenClaimKey matches protocol claim keys', () => {
    expect(isHiddenClaimKey('iss')).toBe(true)
    expect(isHiddenClaimKey('fullName')).toBe(false)
    expect(HIDDEN_CLAIM_KEYS.has('cnf')).toBe(true)
  })

  test('readClaimText returns first non-empty alias match', () => {
    const claims = { birth_date: '  2001-05-15  ', birthDate: 'ignored' }
    expect(readClaimText(claims, ['birthDate', 'birth_date'])).toBe('2001-05-15')
    expect(readClaimText(claims, ['missing'])).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/credentials/claimFormatting.test.ts`

- [ ] **Step 3: Implement module**

Create `src/services/credentials/claimFormatting.ts`:

```ts
export const HIDDEN_CLAIM_KEYS = new Set([
  'vc',
  'iss',
  'iat',
  'nbf',
  'exp',
  'jti',
  'vct',
  'cnf',
  'status',
])

export function isHiddenClaimKey(key: string): boolean {
  return HIDDEN_CLAIM_KEYS.has(key)
}

export function stringifyClaim(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null || value === undefined) return ''
  return JSON.stringify(value)
}

export function readClaimText(claims: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = stringifyClaim(claims[key]).trim()
    if (text.length > 0) return text
  }
  return undefined
}
```

- [ ] **Step 4: Run test — expect PASS**

Run: `yarn test src/services/credentials/claimFormatting.test.ts`

---

### Task 2: Wire claim formatting consumers

**Files:**
- Modify: `src/services/credentials/credentialDisplay.ts`
- Modify: `src/services/vci/qrIssuanceFlow.ts`
- Modify: `src/services/vp/presentationService.ts`
- Modify: `src/services/vp/dcqlCredentialMatch.ts`

- [ ] **Step 1: Update `credentialDisplay.ts`**

Add import:

```ts
import { HIDDEN_CLAIM_KEYS, isHiddenClaimKey, readClaimText, stringifyClaim } from './claimFormatting'
```

Remove local `HIDDEN_CLAIM_KEYS`, `stringifyClaim`, and internal `readFirstClaimText` helpers that duplicate `readClaimText` where possible — keep `readFirstClaimTextLoose` / normalization logic that is display-specific, but route simple key-list reads through `readClaimText`.

Replace filter `HIDDEN_CLAIM_KEYS.has(key)` with `isHiddenClaimKey(key)` in extraRows filter.

- [ ] **Step 2: Update `qrIssuanceFlow.ts`**

Add import:

```ts
import { isHiddenClaimKey, readClaimText, stringifyClaim } from '../credentials/claimFormatting'
```

In `readCredentialInformationRows`:
- Replace `readClaimValue(...)` with `readClaimText(...)`
- Replace `HIDDEN_CLAIM_KEYS.has(key)` with `isHiddenClaimKey(key)`

Delete local `HIDDEN_CLAIM_KEYS`, `readClaimValue`, `stringifyClaim` (lines ~137–153).

- [ ] **Step 3: Update `presentationService.ts` and `dcqlCredentialMatch.ts`**

Replace private `readClaimValueAsString` with import:

```ts
import { readClaimText } from '../credentials/claimFormatting'
```

Call sites: `readClaimText(record.claims, [matchedKey])` or equivalent key array.

Delete local `readClaimValueAsString` function in each file.

- [ ] **Step 4: Regression tests**

Run:

```bash
yarn test src/services/credentials/claimFormatting.test.ts
yarn test credentialDisplay
yarn test qrIssuanceFlow
yarn test presentationService.test.ts
yarn test dcqlCredentialMatch
```

Expected: all pass.

---

### Task 3: Issuer OID4VP friendly errors (step 18)

**Files:**
- Modify: `src/services/scan/scanFriendlyErrors.ts`
- Modify: `src/services/scan/scanFriendlyErrors.test.ts`
- Modify: `src/services/vp/presentationService.ts` (error suffix only)

- [ ] **Step 1: Add failing friendly-error tests**

Append to `scanFriendlyErrors.test.ts`:

```ts
  test('maps Issuer OID4VP untrusted error', () => {
    expect(toFriendlyError('IssuerOid4VpUntrusted: client_id not allowlisted')).toContain('Issuer is not trusted')
  })

  test('maps Issuer OID4VP submission failure', () => {
    expect(toFriendlyError('PresentationSubmissionFailed:issuer: HTTP 400')).toContain('Issuer rejected')
  })

  test('maps missing PID for Issuer presentation', () => {
    expect(toFriendlyError('PresentationCredentialMissing:issuer-pid: no ThaiNationalID')).toContain('Thai National ID')
  })
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/scan/scanFriendlyErrors.test.ts`

- [ ] **Step 3: Extend `toFriendlyError`**

In `scanFriendlyErrors.ts`, add before final `return raw`:

```ts
  if (raw.includes('IssuerOid4VpUntrusted')) {
    return 'This Issuer is not trusted for PID presentation. Configure EXPO_PUBLIC_ISSUER_OID4VP_* env to match the live Issuer.'
  }
  if (raw.includes('PresentationSubmissionFailed:issuer')) {
    const detail = raw.replace(/^PresentationSubmissionFailed:issuer:\s*/, '')
    return detail
      ? `The Issuer rejected the PID presentation. ${detail}`
      : 'The Issuer rejected the PID presentation. Try again or contact the Issuer.'
  }
  if (raw.includes('PresentationCredentialMissing:issuer-pid')) {
    return 'Store Thai National ID (ThaID) before presenting to the Issuer.'
  }
```

Adjust existing `PresentationSubmissionFailed` branch to run **after** the `:issuer` check (order matters).

- [ ] **Step 4: Add error suffix at throw sites (minimal)**

In `presentationService.ts`:

1. When trusted verifier check fails, if `client_id` matches issuer env pattern (import `buildTrustedVerifiersFromEnv` and check issuer entry) OR add helper `isIssuerOid4VpClientId(clientId)` in `trustedVerifiers.ts` — throw:

```ts
throw new Error('IssuerOid4VpUntrusted: client_id and response_uri origin must be allowlisted')
```

Only when request is clearly issuer PID DCQL (e.g. matched credential type `ThaiNationalID` and client_id contains issuer allowlist id). **Simpler v1:** extend untrusted throw when `trustedVerifiers` list has issuer env configured and `client_id` equals issuer client id but origin mismatch:

Actually spec says simpler: add suffix on submit when response_uri origin matches issuer allowlist origin from env. In `submitPresentationResponse`, when building error:

```ts
const isIssuerPost = trustedPartiesIncludeIssuerResponseUri(request.responseUri) // small helper
throw new Error(
  isIssuerPost
    ? `PresentationSubmissionFailed:issuer: HTTP ${response.status}${formatVerifierError(parsedBody)}`
    : `PresentationSubmissionFailed: HTTP ${response.status}${formatVerifierError(parsedBody)}`,
)
```

For missing PID when DCQL asks ThaiNationalID and none stored — in resolve path where `PresentationCredentialMissing` is thrown, if issuer client_id matches allowlist, suffix `:issuer-pid`.

Keep changes minimal — one helper in `trustedVerifierMatcher.ts` or `trustedVerifiers.ts`: `isIssuerOid4VpRequest(clientId: string): boolean`.

- [ ] **Step 5: Run tests — expect PASS**

Run: `yarn test src/services/scan/scanFriendlyErrors.test.ts` and `yarn test presentationService.test.ts`

---

### Task 4: MSW Verifier harness

**Files:**
- Create: `src/__tests__/setup/handlers/verifier.ts`
- Create: `src/__tests__/setup/mswServer.ts`
- Modify: `src/services/vp/presentationService.test.ts`

- [ ] **Step 1: Create verifier handlers**

Create `src/__tests__/setup/handlers/verifier.ts`:

```ts
import { http, HttpResponse } from 'msw'

export const verifierHandlers = [
  http.post('https://issuer.example.com/oid4vp/direct-post', async ({ request }) => {
    const body = await request.text()
    if (!body.includes('vp_token')) {
      return HttpResponse.json({ error: 'invalid_request' }, { status: 400 })
    }
    return HttpResponse.json({ status: 'accepted' }, { status: 200 })
  }),
  http.post('https://verifier.example.com/oid4vp/direct-post', async () =>
    HttpResponse.json({ status: 'verified' }, { status: 200 }),
  ),
]
```

- [ ] **Step 2: Create mswServer**

Create `src/__tests__/setup/mswServer.ts`:

```ts
import { setupServer } from 'msw/node'

import { issuerHandlers } from './handlers/issuer'
import { verifierHandlers } from './handlers/verifier'
import { walletApiHandlers } from './handlers/walletApi'

export const mswServer = setupServer(...walletApiHandlers, ...issuerHandlers, ...verifierHandlers)
```

- [ ] **Step 3: Add MSW describe block in presentationService.test.ts**

At top of file:

```ts
import { mswServer } from '../../__tests__/setup/mswServer'
```

Add new describe:

```ts
describe('presentationService MSW harness', () => {
  beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => mswServer.resetHandlers())
  afterAll(() => mswServer.close())

  test('submits issuer PID VP via MSW direct_post handler', async () => {
    // Reuse issuerPidRequestUri() + thaiIdRecord + trusted issuer entry from existing test
    const request = await resolvePresentationRequest(issuerPidRequestUri(), [thaiIdRecord], { trustedVerifiers: [...] })
    const result = await submitPresentationResponse(request, { vpToken: 'issuer.vp.jwt' })
    expect(result).toEqual({ status: 'accepted' })
  })
})
```

Copy fixture setup from existing test `'resolves issuer OID4VP PID DCQL request and posts VP body to issuer response_uri'`.

- [ ] **Step 4: Run test**

Run: `yarn test presentationService.test.ts`

Expected: all tests pass including MSW block.

---

### Task 5: Production Verifier env checklist (docs)

**Files:**
- Modify: `.env.example`
- Modify: `docs/GETTING_STARTED.md`
- Modify: `docs/TASKS.md`

- [ ] **Step 1: `.env.example`**

Add after issuer OID4VP block (or near Verifier vars):

```bash
# Production OID4VP Verifier trust (release builds). Required instead of EXPO_PUBLIC_VERIFIER_API_BASE_URL.
# EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID=did:web:verifier.example.com
# EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN=https://verifier.example.com
# EXPO_PUBLIC_VERIFIER_DID_WEB_NAME=Trusted Verifier
# EXPO_PUBLIC_VERIFIER_DID_WEB_JWK={"kty":"OKP","crv":"Ed25519","x":"..."}
```

- [ ] **Step 2: `docs/GETTING_STARTED.md`**

Add section **## Production Verifier OID4VP checklist** with numbered steps:
1. Set `EXPO_PUBLIC_VERIFIER_DID_WEB_*` to match customer Verifier `client_id` and `response_uri` origin.
2. Unset `EXPO_PUBLIC_VERIFIER_API_BASE_URL` for release builds (dev-only `redirect_uri` trust).
3. Scan a signed JAR Authorization Request from the production Verifier; confirm trust + submit succeed.

Link spec: `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md`.

- [ ] **Step 3: `docs/TASKS.md`**

- Mark advisory dedupe `[x]` with pointer to `claimFormatting.ts`
- Mark MSW item `[x]` with handler path
- Update item 348 with "env checklist in GETTING_STARTED; E2E pending customer Verifier host"
- Add session note `2026-07-14 (Wave 1 claims/errors/msw/verifier docs)`

---

### Task 6: Final verification

- [ ] **Step 1:**

```bash
yarn tsc --noEmit
yarn lint
yarn test src/services/credentials/claimFormatting.test.ts
yarn test src/services/scan/scanFriendlyErrors.test.ts
yarn test src/services/vp/presentationService.test.ts
```

Expected: pass.

---

## Spec coverage checklist

| Spec section | Task |
|--------------|------|
| B claimFormatting | 1, 2 |
| C scanFriendlyErrors + suffix | 3 |
| E MSW harness | 4 |
| F docs | 5 |
| TASKS | 5 |
