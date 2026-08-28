# Tonyhere OID4VP `direct_post.jwt` Submit Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix or diagnose tonyhere `HTTP 400: invalid_request` on `direct_post.jwt` DCQL presentation by extending wallet submit diagnostics, unifying submit transport, and applying ranked interop fixes without breaking zenithcomp flows.

**Architecture:** Extend `presentationDiagnostics.ts` with transport-layer metadata (JWE structure, encrypted payload shape) separate from existing KB-JWT checks. Route **all** `direct_post` / `direct_post.jwt` submits through `buildDirectPostFormBody` (including `protocolPath: 'oid4vc'`). Use dev env probes for `vp_token` shape and `enc` algorithm A/B; apply production fix only after device evidence.

**Tech Stack:** Expo SDK 54, Hermes, Jest, `react-native-quick-crypto`, existing `jweEcdhEs.ts`, `directPostFormBody.ts`, `presentationService.ts`.

**Spec:** `docs/superpowers/specs/2026-08-24-tonyhere-oid4vp-direct-post-jwt-design.md`

## Global Constraints

- No logging of `vp_token`, disclosures, claim values, JWE plaintext, or key material.
- One biometric prompt per presentation (sign-time gate only; no new consent biometric).
- NativeWind only; no new screens.
- `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE` and `EXPO_PUBLIC_OID4VP_JWE_ENC` are **dev A/B probes** until device evidence locks a default.
- Run `yarn test <focused>`, `yarn tsc --noEmit` after each task; update `docs/TASKS.md` when slice completes.
- Do not commit unless the user explicitly requests.

---

## File map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/services/vp/presentationDiagnostics.ts` | Modify | Add `describeEncryptedSubmitAttempt()` |
| `src/services/vp/presentationDiagnostics.test.ts` | Modify | Transport diagnostic tests |
| `src/services/vp/presentationService.ts` | Modify | Wire diagnostics on submit failure |
| `src/services/vp/oid4vc/submitDirectPostViaOid4vc.ts` | Modify | Unify plaintext submit via `buildDirectPostFormBody` |
| `src/services/vp/oid4vc/submitDirectPostViaOid4vc.test.ts` | Modify | Parsed `vp_token` for DCQL plaintext |
| `src/services/vp/directPostFormBody.ts` | Modify | Export payload-shape helpers if needed |
| `src/services/vp/directPostFormBody.test.ts` | Modify | DCQL envelope inside encrypted payload |
| `src/services/crypto/jweEcdhEs.test.ts` | Modify | OID4VP spec-shaped DCQL envelope vector |
| `src/config/runtimeFlags.ts` | Modify | `readOid4vpJweEncOverride()` dev probe |
| `src/config/runtimeFlags.test.ts` | Modify | JWE enc override tests |
| `src/services/vp/oid4vpResponseEncryption.ts` | Modify | Honor enc override in dev |
| `src/services/vp/presentationFailureUi.ts` | Modify | Dev layer hints on opaque 400 |
| `.env.example` | Modify | Document `EXPO_PUBLIC_OID4VP_JWE_ENC` |
| `docs/TASKS.md` | Modify | Device A/B results + session note |

---

### Task 1: Transport diagnostics (`describeEncryptedSubmitAttempt`)

**Files:**
- Modify: `src/services/vp/presentationDiagnostics.ts`
- Modify: `src/services/vp/presentationDiagnostics.test.ts`
- Modify: `src/services/vp/presentationService.ts` (submit failure path)

**Interfaces:**
- Consumes: `ResolvedPresentationRequest`, formatted `vpToken` string, optional compact JWE `response` string
- Produces:
  ```typescript
  export function describeEncryptedSubmitAttempt(input: {
    request: Pick<ResolvedPresentationRequest, 'responseMode' | 'protocolPath' | 'state' | 'dcqlQuery'>
    formattedVpToken: string
    compactJwe?: string
  }): string
  ```
  Returns semicolon-separated metadata: `response_mode`, `protocol_path`, `jwe_segments`, `jwe_alg`, `jwe_enc`, `jwe_kid`, `jwe_bytes`, `vp_token_json_type`, `dcql_envelope_shape`, `state_in_encrypted_payload` (inferred from pre-encrypt payload builder in tests only — production logs structural fields from JWE header + formatted token type, not decrypted plaintext).

- [ ] **Step 1: Write failing test**

```typescript
// src/services/vp/presentationDiagnostics.test.ts (add)
import { describeEncryptedSubmitAttempt } from './presentationDiagnostics'

test('describeEncryptedSubmitAttempt reports JWE structure without token content', () => {
  const jwe = 'eyJhbGciOiJFQ0RILUVTIiwiZW5jIjoiQTEyOEdDTSJ9..iv.ct.tag'
  const summary = describeEncryptedSubmitAttempt({
    request: {
      responseMode: 'direct_post.jwt',
      protocolPath: 'oid4vc',
      state: 's1',
      dcqlQuery: { credentials: [{ id: 'cred-1' }] },
    },
    formattedVpToken: '{"cred-1":["eyJ.test~kb"]}',
    compactJwe: jwe,
  })

  expect(summary).toContain('response_mode=direct_post.jwt')
  expect(summary).toContain('protocol_path=oid4vc')
  expect(summary).toContain('jwe_segments=5')
  expect(summary).toContain('vp_token_json_type=object')
  expect(summary).toContain('dcql_envelope_shape=')
  expect(summary).not.toContain('eyJ.test')
})
```

- [ ] **Step 2:** Run `yarn test src/services/vp/presentationDiagnostics.test.ts` — expect FAIL (`describeEncryptedSubmitAttempt` not defined).

- [ ] **Step 3: Implement** `describeEncryptedSubmitAttempt` in `presentationDiagnostics.ts`:
  - Parse JWE protected header (segment 0) for `alg`, `enc`, `kid` only.
  - Count segments (expect 5).
  - Classify `formattedVpToken`: if starts with `{`, parse once and report `vp_token_json_type=object|string|array`; else `string`.
  - Read `dcql_envelope_shape` from `readVerifierDcqlVpTokenShape()`.
  - Never include token substrings longer than 0 chars from vp_token.

- [ ] **Step 4:** In `presentationService.ts` `submitPresentationResponse` catch block (oid4vc path), append transport diagnostic when `responseMode === 'direct_post.jwt'`:

```typescript
const transportDiagnostic = request.responseMode === 'direct_post.jwt'
  ? describeEncryptedSubmitAttempt({
      request,
      formattedVpToken: formattedVpToken,
      compactJwe: /* read from built body if available */,
    })
  : undefined
```

  Pass `compactJwe` from `submitDirectPostViaOid4vc` return or build body before fetch in adapter.

- [ ] **Step 5:** Run `yarn test src/services/vp/presentationDiagnostics.test.ts` — expect PASS.

---

### Task 2: Unify oid4vc plaintext submit through `buildDirectPostFormBody`

**Files:**
- Modify: `src/services/vp/oid4vc/submitDirectPostViaOid4vc.ts`
- Modify: `src/services/vp/oid4vc/submitDirectPostViaOid4vc.test.ts`

**Interfaces:**
- Consumes: `buildDirectPostFormBody` from `../directPostFormBody`
- Produces: `submitDirectPostViaOid4vc` posts URLSearchParams from `buildDirectPostFormBody` for **both** `direct_post` and `direct_post.jwt` (remove `submitOpenid4vpAuthorizationResponse` branch for plaintext).

- [ ] **Step 1: Write failing test**

```typescript
// submitDirectPostViaOid4vc.test.ts — replace plaintext expectation
it('submits DCQL vp_token as parsed object for direct_post plaintext', async () => {
  const fetchImpl = jest.fn(async () =>
    new Response(JSON.stringify({ status: 'verified' }), { status: 200 }),
  )

  await submitDirectPostViaOid4vc({
    oid4vcContext,
    responseUri: 'https://verifier.example/verify',
    responseMode: 'direct_post',
    vpToken: JSON.stringify({ idcard_credential: ['vp.jwt'] }),
    state: 'request-123',
    request: {
      responseMode: 'direct_post',
      state: 'request-123',
      dcqlQuery: { credentials: [{ id: 'idcard_credential' }] },
    },
    fetchImpl: fetchImpl as unknown as typeof fetch,
  })

  const body = new URLSearchParams(String((fetchImpl.mock.calls[0] as [unknown, RequestInit])[1]?.body ?? ''))
  // Today fails: body has stringified JSON; spec wants same shape as encrypted path inner payload
  const parsed = JSON.parse(body.get('vp_token')!)
  expect(parsed).toEqual({ idcard_credential: ['vp.jwt'] })
})
```

  **Note:** If OID4VP plaintext `direct_post` requires `vp_token` as form string (not JSON object), adjust test to match spec §8.2 — encrypted path uses object; plaintext may stay string. Read `directPostFormBody.ts` current behavior and align test with **parsed object for DCQL when envelope is JSON** per spec Fix 4. If zenithcomp expects string, gate object serialization on `dcqlQuery` presence only.

- [ ] **Step 2:** Run test — expect FAIL.

- [ ] **Step 3:** Refactor `submitDirectPostViaOid4vc.ts`:
  - Delete `submitOpenid4vpAuthorizationResponse` import and plaintext branch.
  - For all modes, call `buildDirectPostFormBody({ request, formattedVpToken: vpToken, presentationSubmission })` then `fetchImpl(responseUri, { method: 'POST', headers, body: body.toString() })`.
  - Return `{ ok, status, parsedBody }` unchanged.

- [ ] **Step 4:** Update `directPostFormBody.ts` if plaintext DCQL must `JSON.stringify` the object envelope for form field `vp_token` (verifier receives JSON string in form, not double-encoded).

- [ ] **Step 5:** Run `yarn test src/services/vp/oid4vc/submitDirectPostViaOid4vc.test.ts src/services/vp/directPostFormBody.test.ts` — expect PASS.

---

### Task 3: JWE golden vector — DCQL query-id envelope

**Files:**
- Modify: `src/services/crypto/jweEcdhEs.test.ts`

**Interfaces:**
- Consumes: existing `encryptCompactJweEcdhEsP256` / `decryptCompactJweEcdhEsP256ForTest`
- Produces: regression test matching tonyhere-shaped payload

- [ ] **Step 1: Add test** (may pass immediately — documents contract):

```typescript
it('round-trips OID4VP DCQL object_array envelope', () => {
  const { privateKey, jwk } = buildRecipientFixture()
  const queryId = 'a6d72bee-617c-4670-8b18-3b015eb22088'
  const payload = {
    vp_token: { [queryId]: ['issuer.jwt~disc~kb.jwt'] },
    state: '8ae9ba73-9061-4391-af2a-b7d9d0004a09',
  }

  const jwe = encryptCompactJweEcdhEsP256({ recipientJwk: jwk, enc: 'A128GCM', payload })
  expect(decryptCompactJweEcdhEsP256ForTest(jwe, privateKey)).toEqual(payload)
})
```

- [ ] **Step 2:** Run `yarn test src/services/crypto/jweEcdhEs.test.ts` — expect PASS. If FAIL, fix `jweEcdhEs.ts` KDF/segment layout per RFC 7518.

---

### Task 4: Dev `enc` algorithm override

**Files:**
- Modify: `src/config/runtimeFlags.ts`
- Modify: `src/config/runtimeFlags.test.ts`
- Modify: `src/services/vp/oid4vpResponseEncryption.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:
  ```typescript
  export function readOid4vpJweEncOverride(): 'A128GCM' | 'A256GCM' | undefined
  ```
  `resolveOid4vpResponseEncryptionParams` uses override when set (dev A/B only).

- [ ] **Step 1: Failing test** in `runtimeFlags.test.ts` for `EXPO_PUBLIC_OID4VP_JWE_ENC=A256GCM`.

- [ ] **Step 2:** Implement `readOid4vpJweEncOverride`; wire into `selectEncAlgorithm` or `resolveOid4vpResponseEncryptionParams`.

- [ ] **Step 3:** Document in `.env.example`:
  ```
  # Dev A/B only: force JWE content encryption alg for direct_post.jwt (A128GCM | A256GCM)
  # EXPO_PUBLIC_OID4VP_JWE_ENC=A256GCM
  ```

- [ ] **Step 4:** Run focused tests — PASS.

---

### Task 5: Device A/B matrix + apply winning fix

**Files:**
- Modify: `docs/TASKS.md` (session results only unless code change needed)

**Procedure (physical device, tonyhere pid-age QR):**

| Run | Env | Record |
|-----|-----|--------|
| 1 | defaults (`object_array`, `A128GCM`) | baseline 400 |
| 2 | `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE=raw` | HTTP status + transport diagnostic |
| 3 | `EXPO_PUBLIC_VERIFIER_DCQL_VP_TOKEN_SHAPE=object_string` | HTTP status |
| 4 | `EXPO_PUBLIC_OID4VP_JWE_ENC=A256GCM` (if metadata lists it) | HTTP status |

- [ ] **Step 1:** Reload Metro after each env change; capture `submit-response-failed` diagnostic line (transport + KB).

- [ ] **Step 2:** If a shape wins (HTTP 2xx), either:
  - (a) Set tonyhere build profile / EAS env for preview, **or**
  - (b) If spec-compliant default should change globally, update `readVerifierDcqlVpTokenShape()` default with regression test note.

- [ ] **Step 3:** If all shapes fail with same `invalid_request`, document Fix 5 (VP semantic / re-issue) in `docs/TASKS.md` — wallet transport verified.

---

### Task 6: Failure UI dev hints

**Files:**
- Modify: `src/services/vp/presentationFailureUi.ts`
- Modify: `src/services/vp/presentationFailureUi.test.ts`

**Interfaces:**
- Consumes: error message containing transport diagnostic keys
- Produces: `__DEV__` body includes layer hint (`jwe_segments`, `vp_token_json_type`) without OAuth codes

- [ ] **Step 1:** Test that `resolvePresentationFailureUi` strips `invalid_request` in prod but preserves dev transport hints when `__DEV__`.

- [ ] **Step 2:** Implement minimal mapping.

- [ ] **Step 3:** Run `yarn test src/services/vp/presentationFailureUi.test.ts` — PASS.

---

### Task 7: Regression sweep

- [ ] Run:
  ```bash
  yarn test src/services/vp/presentationDiagnostics.test.ts \
    src/services/vp/oid4vc/submitDirectPostViaOid4vc.test.ts \
    src/services/vp/directPostFormBody.test.ts \
    src/services/crypto/jweEcdhEs.test.ts \
    src/services/vp/presentationService.test.ts \
    src/config/runtimeFlags.test.ts \
    --no-coverage
  yarn tsc --noEmit
  ```

- [ ] Update `docs/TASKS.md` with session outcome and any locked env for tonyhere preview builds.

---

## Spec coverage self-review

| Spec section | Task |
|---|---|
| Submit diagnostics extension | Task 1 |
| Unify submit transport | Task 2 |
| Fix 1 JWE golden vector | Task 3 |
| Fix 2 vp_token shape A/B | Task 5 |
| Fix 3 enc override | Task 4 |
| Fix 4 payload completeness | Task 2 |
| Fix 5 VP semantic follow-up | Task 5 Step 3 |
| Error surfacing | Task 6 |
| Testing plan | Tasks 1–7 |
| Security (no token logs) | Task 1 tests + Global Constraints |

## Open questions (deferred to Task 5 device runs)

1. `presentation_submission` for DCQL — omit unless device proves required.
2. Verifier profile vs env-only shape — decide after A/B.
3. `EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER` — note in TASKS if enabled during runs.
