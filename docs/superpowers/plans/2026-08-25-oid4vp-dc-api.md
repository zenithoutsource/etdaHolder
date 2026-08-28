# OID4VP DC API (dc_api / dc_api.jwt) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register the wallet as an Android Digital Credential provider and complete OpenID4VP-over-DC-API mDL presentation to [digital-credentials.dev](https://digital-credentials.dev/) (unsigned + signed + encrypted, same-device + cross-device).

**Architecture:** New `expo-dc-api-provider` native module receives platform requests and bridges to `src/services/vp/dcApi/`. Trust, DCQL match, consent, and JWE reuse existing VP layers. New native `buildDcApiDeviceResponse` in `expo-mdoc-proximity` builds ISO `DeviceResponse` with `OpenID4VPDCAPIHandover` (distinct from NFC handover).

**Tech Stack:** Expo SDK 54, React Native, TypeScript, Jest, Kotlin (AndroidX Credential Manager / Digital Credentials), Multipaz mdoc stack (existing), hardware P-256 via `expo-wallet-hardware-ecdsa`.

**Spec:** `docs/superpowers/specs/2026-08-25-oid4vp-dc-api-design.md`

## Global Constraints

- Respond in English in code comments and docs.
- Do not use customer org name in new identifiers, file names, or docs.
- NativeWind only for UI touched; no new `StyleSheet`.
- One biometric prompt per presentation — device-auth sign is the only gate; no extra consent biometric.
- Configurable policy values use `process.env.EXPO_PUBLIC_<NAME>` with fallback defaults; document in `.env.example`.
- Every caught error logs raw diagnostic before safe UI mapping; never log claims, DeviceResponse plaintext, JWE keys, or PII.
- Unsigned `dc_api` rejected in production release builds regardless of env.
- `readWalletDemoInteropEnabled()` activation rule unchanged (`EXPO_PUBLIC_BUILD_PROFILE=production` → false).
- Existing `openid4vp://` + `direct_post` Scan path must remain green (regression tests required).
- NFC proximity path (ADR 0003) unchanged.
- Target hardware validation: Samsung Galaxy A26 + Chrome for E2E gate.

---

## File Map

| File | Responsibility |
|------|----------------|
| `docs/adr/0012-dc-api-online-presentation-transport.md` | Locked decision: DC API complements NFC, not replaces Scan |
| `modules/expo-dc-api-provider/` | Android Credential Manager provider + JS bridge |
| `src/services/vp/dcApi/dcApiTrustPolicy.ts` | Auto unsigned/signed/production trust |
| `src/services/vp/dcApi/dcApiRequestParser.ts` | Normalize platform payload → internal request |
| `src/services/vp/dcApi/dcApiResponseBuilder.ts` | `dc_api` / `dc_api.jwt` response envelope |
| `src/services/vp/dcApi/dcApiPresentationService.ts` | Orchestration: trust → match → consent → sign → respond |
| `src/services/vp/dcApi/dcApiConsentBridge.ts` | Zustand/event bridge from native → consent UI |
| `src/store/dcApiPresentationStore.ts` | Pending DC API session state |
| `modules/expo-mdoc-proximity/.../DcApiHandoverCbor.kt` | `OpenID4VPDCAPIHandover` CBOR |
| `modules/expo-mdoc-proximity/.../DcApiDeviceResponseBuilder.kt` | Full DeviceResponse for DC API |
| `app/dc-api-presentation.tsx` | Hidden route for DC API consent (mirrors presentation-request) |
| `app/_layout.tsx` | Register native provider startup + route |
| `src/components/DcApiPresentationFlow.tsx` | Thin wrapper over consent/submit for DC API |
| `docs/CODEMAPS/frontend.md` | Document new entry route |

---

### Task 1: ADR and spec linkage

**Files:**
- Create: `docs/adr/0012-dc-api-online-presentation-transport.md`
- Modify: `docs/superpowers/specs/2026-08-25-oid4vp-dc-api-design.md` (status → Approved with plan link)
- Modify: `docs/TASKS.md` (add active slice pointer)

**Interfaces:** None (docs only)

- [ ] **Step 1: Write ADR 0012**

Create `docs/adr/0012-dc-api-online-presentation-transport.md` with: Context (digital-credentials.dev / W3C DC API), Decision (Android DC API provider + `dc_api` modes; NFC ADR 0003 unchanged; Scan `direct_post` unchanged), Consequences (new native module, iOS deferred).

- [ ] **Step 2: Link spec and TASKS**

Add to spec header: `**Plan:** docs/superpowers/plans/2026-08-25-oid4vp-dc-api.md`

Add TASKS.md section: active slice "OID4VP DC API (digital-credentials.dev)" pointing at spec + plan.

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0012-dc-api-online-presentation-transport.md docs/superpowers/specs/2026-08-25-oid4vp-dc-api-design.md docs/TASKS.md
git commit -m "docs: ADR 0012 for OID4VP DC API online presentation transport"
```

---

### Task 2: DC API trust policy

**Files:**
- Create: `src/services/vp/dcApi/dcApiTrustPolicy.ts`
- Create: `src/services/vp/dcApi/dcApiTrustPolicy.test.ts`

**Interfaces:**
- Produces: `evaluateDcApiTrust(input: DcApiTrustInput): DcApiTrustResult`
- Consumes: `readWalletDemoInteropEnabled`, `findTrustedVerifier`, `parseAuthorizationRequestBody` (signed path)

- [ ] **Step 1: Write failing tests**

```typescript
// src/services/vp/dcApi/dcApiTrustPolicy.test.ts
import { evaluateDcApiTrust } from './dcApiTrustPolicy'

describe('evaluateDcApiTrust', () => {
  test('rejects unsigned dc_api in production release profile', () => {
    const prev = process.env.EXPO_PUBLIC_BUILD_PROFILE
    process.env.EXPO_PUBLIC_BUILD_PROFILE = 'production'
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    const result = evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'https://digital-credentials.dev',
      responseMode: 'dc_api',
      clientId: undefined,
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/unsigned/i)
    process.env.EXPO_PUBLIC_BUILD_PROFILE = prev
  })

  test('allows unsigned dc_api in dev when demo interop enabled and origin is https', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    delete process.env.EXPO_PUBLIC_BUILD_PROFILE
    const result = evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'https://digital-credentials.dev',
      responseMode: 'dc_api',
      clientId: undefined,
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: true,
    })
    expect(result).toEqual({ allowed: true })
  })

  test('rejects non-https origin for unsigned', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    const result = evaluateDcApiTrust({
      isSignedRequest: false,
      origin: 'http://insecure.example',
      responseMode: 'dc_api',
      authorizationRequest: { nonce: 'n1', response_mode: 'dc_api' },
      trustedVerifiers: [],
      isDevelopment: true,
    })
    expect(result.allowed).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/vp/dcApi/dcApiTrustPolicy.test.ts --no-cache`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement policy**

```typescript
// src/services/vp/dcApi/dcApiTrustPolicy.ts
import { readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'
import { findTrustedVerifier, type TrustedVerifier } from '@/src/services/vp/trustedVerifierMatcher'
import { readTrustAnyOid4vcPeerForClientId } from '@/src/config/oid4vcPeerTrustPolicy'

export type DcApiTrustInput = {
  isSignedRequest: boolean
  origin: string
  responseMode: 'dc_api' | 'dc_api.jwt'
  clientId?: string
  authorizationRequest: Record<string, unknown>
  trustedVerifiers: TrustedVerifier[]
  isDevelopment?: boolean
}

export type DcApiTrustResult =
  | { allowed: true; verifier?: TrustedVerifier }
  | { allowed: false; reason: string }

export function evaluateDcApiTrust(input: DcApiTrustInput): DcApiTrustResult {
  const isDev = input.isDevelopment ?? __DEV__
  const buildProfile = process.env.EXPO_PUBLIC_BUILD_PROFILE
  const isProductionRelease = buildProfile === 'production'

  if (!input.origin.startsWith('https://')) {
    return { allowed: false, reason: 'PresentationRequestInvalid: DC API origin must be HTTPS' }
  }

  if (!input.isSignedRequest) {
    if (isProductionRelease) {
      return { allowed: false, reason: 'PresentationRequestUnsupported: unsigned dc_api is not supported in production release' }
    }
    if (!readWalletDemoInteropEnabled(isDev)) {
      return { allowed: false, reason: 'PresentationRequestUnsupported: unsigned dc_api requires demo interop in development' }
    }
    return { allowed: true }
  }

  if (!input.clientId) {
    return { allowed: false, reason: 'PresentationRequestInvalid: signed dc_api requires client_id' }
  }

  const responseUri = `origin:${input.origin}`
  const verifier = findTrustedVerifier(
    input.clientId,
    responseUri,
    input.trustedVerifiers,
    readTrustAnyOid4vcPeerForClientId(input.clientId) || readWalletDemoInteropEnabled(isDev),
  )
  if (!verifier) {
    return { allowed: false, reason: 'PresentationRequestUntrusted: signed dc_api verifier not trusted' }
  }
  return { allowed: true, verifier }
}

export function readDcApiMdocAudience(origin: string): string {
  return `origin:${origin.replace(/\/$/, '')}`
}
```

- [ ] **Step 4: Run tests**

Run: `yarn test src/services/vp/dcApi/dcApiTrustPolicy.test.ts --no-cache`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/vp/dcApi/dcApiTrustPolicy.ts src/services/vp/dcApi/dcApiTrustPolicy.test.ts
git commit -m "feat: add DC API automatic trust policy"
```

---

### Task 3: OpenID4VPDCAPIHandover CBOR (native unit tests)

**Files:**
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/DcApiHandoverCbor.kt`
- Create: `modules/expo-mdoc-proximity/android/src/test/java/com/etdawallet/mdocproximity/DcApiHandoverCborTest.kt`

**Interfaces:**
- Produces: `DcApiHandoverCbor.buildHandover(origin: String, nonce: String, jwkThumbprint: ByteArray?): ByteArray`
- Produces: `DcApiHandoverCbor.sha256ThumbprintOfJwk(jwkJson: String): ByteArray?`

- [ ] **Step 1: Write failing JVM test**

Golden-vector test from OID4VP spec Appendix A: handover array starts with `"OpenID4VPDCAPIHandover"`, second element is sha-256 of CBOR-encoded `[origin, nonce, null]` for unsigned.

- [ ] **Step 2: Run test**

Run: `cd modules/expo-mdoc-proximity/android && ../../gradlew test --tests com.etdawallet.mdocproximity.DcApiHandoverCborTest`  
Expected: FAIL

- [ ] **Step 3: Implement `DcApiHandoverCbor.kt`**

Use existing CBOR utilities in module (or `co.nstant.in.cbor` if already on classpath). Encode:

```kotlin
// OpenID4VPDCAPIHandoverInfo = [origin tstr, nonce tstr, jwkThumbprint bstr|null]
// OpenID4VPDCAPIHandover = ["OpenID4VPDCAPIHandover", sha256(infoBytes)]
```

- [ ] **Step 4: Run test — PASS**

- [ ] **Step 5: Commit**

```bash
git add modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/DcApiHandoverCbor.kt modules/expo-mdoc-proximity/android/src/test/java/com/etdawallet/mdocproximity/DcApiHandoverCborTest.kt
git commit -m "feat: add OpenID4VPDCAPIHandover CBOR builder"
```

---

### Task 4: DC API DeviceResponse builder (native)

**Files:**
- Create: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/DcApiDeviceResponseBuilder.kt`
- Modify: `modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ExpoMdocProximityModule.kt`
- Create: `modules/expo-mdoc-proximity/android/src/test/java/com/etdawallet/mdocproximity/DcApiDeviceResponseBuilderTest.kt`

**Interfaces:**
- Produces (JS callable): `buildDcApiDeviceResponseAsync(params: BuildDcApiDeviceResponseParams): Promise<string>` returning base64url DeviceResponse
- Consumes: `DcApiHandoverCbor.buildHandover`, stored mdoc bytes, approved ISO namespace keys, hardware sign callback

```typescript
// JS type (add to module types)
export type BuildDcApiDeviceResponseParams = {
  credentialId: string
  approvedNamespaceKeys: string[] // e.g. org.iso.18013.5.1/family_name
  origin: string
  nonce: string
  encryptionJwkJson?: string // for dc_api.jwt thumbprint; omit for dc_api
}
```

- [ ] **Step 1: Write failing JVM test**

Parse output CBOR confirms top-level `DeviceResponse` map, `SessionTranscript` handover matches Task 3 builder, disclosed doc types include requested namespaces only.

- [ ] **Step 2: Implement builder**

Reuse Multipaz presentment patterns from `MultipazPresentmentSession.kt` where possible but **do not** reuse NFC `DeviceEngagement` / `NfcStaticHandover`. SessionTranscript uses null engagement + DC API handover per spec.

Wire P-256 device auth through existing opaque handle + hardware session (same as proximity).

- [ ] **Step 3: Expose on `ExpoMdocProximityModule`**

Add async function `buildDcApiDeviceResponse` with biometric-gated sign (single native session).

- [ ] **Step 4: Run JVM tests + `yarn tsc --noEmit`**

- [ ] **Step 5: Commit**

```bash
git add modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/DcApiDeviceResponseBuilder.kt modules/expo-mdoc-proximity/android/src/main/java/com/etdawallet/mdocproximity/ExpoMdocProximityModule.kt modules/expo-mdoc-proximity/android/src/test/java/com/etdawallet/mdocproximity/DcApiDeviceResponseBuilderTest.kt
git commit -m "feat: build mdoc DeviceResponse for OID4VP DC API handover"
```

---

### Task 5: DC API response builder (TypeScript)

**Files:**
- Create: `src/services/vp/dcApi/dcApiResponseBuilder.ts`
- Create: `src/services/vp/dcApi/dcApiResponseBuilder.test.ts`
- Modify: `src/services/vp/oid4vpResponseEncryption.ts` (export shared enc resolution or duplicate thin wrapper)

**Interfaces:**
- Consumes: `encryptCompactJweEcdhEsP256`, `resolveOid4vpResponseEncryptionParams`
- Produces: `buildDcApiPresentationPayload(input): DcApiPresentationPayload`

```typescript
export type DcApiPresentationPayload =
  | { responseMode: 'dc_api'; data: { vp_token: Record<string, string[]> } }
  | { responseMode: 'dc_api.jwt'; response: string }
```

- [ ] **Step 1: Write failing tests**

Test `object_array` vp_token shape `{ cred1: [base64urlDeviceResponse] }`. Test `dc_api.jwt` returns compact JWE string only (no plaintext fields).

- [ ] **Step 2: Implement builder**

Reuse `formatDcqlVpTokenEnvelope` pattern with DCQL query id from request. For `dc_api.jwt`, encrypt `{ vp_token }` JSON (no `state` — DC API omits state per spec).

- [ ] **Step 3: Run tests — PASS**

Run: `yarn test src/services/vp/dcApi/dcApiResponseBuilder.test.ts --no-cache`

- [ ] **Step 4: Commit**

---

### Task 6: DC API request parser + presentation service (unit-tested orchestration)

**Files:**
- Create: `src/services/vp/dcApi/dcApiRequestParser.ts`
- Create: `src/services/vp/dcApi/dcApiRequestParser.test.ts`
- Create: `src/services/vp/dcApi/dcApiPresentationService.ts`
- Create: `src/services/vp/dcApi/dcApiPresentationService.test.ts`

**Interfaces:**
- Consumes: `evaluateDcApiTrust`, `assertSupportedDcApiResponseMode`, DCQL matchers from `dcqlCredentialMatch`, `buildDcApiPresentationPayload`, mocked `buildDcApiDeviceResponse`
- Produces: `resolveDcApiPresentation(input: DcApiIncomingRequest, credentials): Promise<DcApiResolvedPresentation>`
- Produces: `completeDcApiPresentation(input: DcApiCompletionInput): Promise<DcApiPresentationPayload>`

```typescript
export type DcApiIncomingRequest = {
  sessionId: string
  protocol: 'openid4vp-v1-unsigned' | 'openid4vp-v1-signed'
  origin: string
  request: Record<string, unknown>
}
```

- [ ] **Step 1: Parser tests** — map platform JSON to internal authorization request; extract `response_mode`, `dcql_query`, signed JAR from `request` string when protocol is signed.

- [ ] **Step 2: Service tests** — mock native module; assert trust rejection, credential missing, happy path calls DeviceResponse builder with `readDcApiMdocAudience(origin)`.

- [ ] **Step 3: Implement parser + service**

Signed path: reuse `parseAuthorizationRequestBody` / JAR verification from `authorizationRequestJar.ts`.

Match: reuse `resolveDcqlCredentialSelection` for standalone `mso_mdoc` + `doctype_value`.

- [ ] **Step 4: Add `assertSupportedDcApiResponseMode`**

```typescript
export function assertSupportedDcApiResponseMode(mode: string): asserts mode is 'dc_api' | 'dc_api.jwt' {
  if (mode !== 'dc_api' && mode !== 'dc_api.jwt') {
    throw new Error(`PresentationRequestUnsupported: response_mode ${mode} is not supported for DC API`)
  }
}
```

- [ ] **Step 5: Run tests — PASS**

- [ ] **Step 6: Commit**

---

### Task 7: expo-dc-api-provider module scaffold

**Files:**
- Create: `modules/expo-dc-api-provider/expo-module.config.json`
- Create: `modules/expo-dc-api-provider/package.json`
- Create: `modules/expo-dc-api-provider/android/build.gradle`
- Create: `modules/expo-dc-api-provider/android/src/main/AndroidManifest.xml`
- Create: `modules/expo-dc-api-provider/android/src/main/java/com/wallet/dcapiprovider/ExpoDcApiProviderModule.kt`
- Create: `modules/expo-dc-api-provider/android/src/main/java/com/wallet/dcapiprovider/DcApiProviderService.kt`
- Create: `modules/expo-dc-api-provider/src/index.ts`
- Modify: `package.json` (workspace dependency)
- Modify: `app.json` or `app.config.ts` (autolink module)

**Interfaces:**
- Produces (JS): `startDcApiProviderListener()`, `completeDcApiSession(sessionId, payload)`, `cancelDcApiSession(sessionId, reason)`
- Produces (events): `onDcApiPresentationRequest`, `onDcApiCrossDeviceSession`

- [ ] **Step 1: Scaffold Expo module** (mirror `modules/expo-mdoc-proximity` layout)

- [ ] **Step 2: Register AndroidX Credential Manager Digital Credential provider** in manifest per [Android Credential Manager docs](https://developer.android.com/identity/digital-credentials) for protocol identifiers `openid4vp-v1-unsigned`, `openid4vp-v1-signed`.

- [ ] **Step 3: `DcApiProviderService` forwards request + origin to JS via Expo module event** with `sessionId`.

- [ ] **Step 4: `completeDcApiSession` returns `DigitalCredential` to platform** with `data` from JS payload.

- [ ] **Step 5: `npx expo prebuild --platform android` succeeds**

- [ ] **Step 6: Commit**

---

### Task 8: Consent bridge + hidden UI route

**Files:**
- Create: `src/store/dcApiPresentationStore.ts`
- Create: `src/services/vp/dcApi/dcApiConsentBridge.ts`
- Create: `src/components/DcApiPresentationFlow.tsx`
- Create: `app/dc-api-presentation.tsx`
- Modify: `app/_layout.tsx`
- Modify: `docs/CODEMAPS/frontend.md`

**Interfaces:**
- Consumes: `onDcApiPresentationRequest` event, `DcApiPresentationFlow` uses `resolveDcApiPresentation` + consent panels
- Produces: `completeDcApiSession` / `cancelDcApiSession` calls back to native

- [ ] **Step 1: Zustand store** for pending `{ sessionId, origin, resolved }`.

- [ ] **Step 2: Bridge** on native event → navigate to `/dc-api-presentation` (hidden route, no tab icon).

- [ ] **Step 3: `DcApiPresentationFlow`** — reuse `PresentationConsentPanel`, `PresentationInfoPanel`, `PresentationResultPanel`; **skip** face prepare unless schema requires (mDL DC API: consent → sign via native DeviceResponse only = one biometric).

- [ ] **Step 4: Wire `_layout.tsx`** to start provider listener on Android native startup (same pattern as mdoc proximity init).

- [ ] **Step 5: Update CODEMAP** with DC API presentation entry.

- [ ] **Step 6: Commit**

---

### Task 9: Cross-device handoff

**Files:**
- Modify: `modules/expo-dc-api-provider/.../DcApiProviderService.kt`
- Modify: `src/services/vp/dcApi/dcApiConsentBridge.ts`
- Create: `src/services/vp/dcApi/dcApiCrossDevice.test.ts`

**Interfaces:**
- Produces: unified `DcApiIncomingRequest` whether same-device or cross-device (platform abstracts CTAP hybrid)

- [ ] **Step 1: Document platform callback shape** from A26 device logs (`adb logcat`, tag `DcApiProvider`).

- [ ] **Step 2: Normalize cross-device session into same `sessionId` pipeline** as same-device.

- [ ] **Step 3: Test JS normalization** with fixture payloads from log capture (no PII in repo — use redacted fixtures under `src/services/vp/dcApi/__fixtures__/`).

- [ ] **Step 4: Commit**

---

### Task 10: Integration tests + regression guard

**Files:**
- Create: `src/services/vp/dcApi/dcApiPresentationService.integration.test.ts`
- Modify: `src/services/vp/presentationService.test.ts` (assert `direct_post` unchanged)
- Modify: `src/services/vp/oid4vpResponseEncryption.test.ts` (dc_api modes NOT added to `isSupportedOid4vpResponseMode` — DC API uses separate assert)

**Interfaces:** Validates Scan path still rejects `dc_api` at `isSupportedOid4vpResponseMode` in `presentationService` while DC API service accepts it.

- [ ] **Step 1: Integration test** mock native provider event → mock DeviceResponse → payload shape.

- [ ] **Step 2: Regression test** existing `resolvePresentationRequest` with `direct_post.jwt` still passes fixtures.

- [ ] **Step 3: Run full VP test suite**

Run: `yarn test src/services/vp --no-cache`

- [ ] **Step 4: Run `yarn tsc --noEmit` and `yarn lint` on touched paths**

- [ ] **Step 5: Commit**

---

### Task 11: Device E2E validation + TASKS handoff

**Files:**
- Modify: `docs/TASKS.md`
- Modify: `.env.development.local.example`
- Modify: `eas.json` (ensure preview profile has demo interop if needed)

**Interfaces:** None

- [ ] **Step 1: Document device checklist in TASKS.md**

Checklist:
- [ ] `EXPO_PUBLIC_WALLET_DEMO_INTEROP=true` in dev build
- [ ] mDL present in wallet
- [ ] Chrome on A26 → digital-credentials.dev unsigned same-device
- [ ] Signed request checkbox
- [ ] Use encryption checkbox (`dc_api.jwt`)
- [ ] Desktop QR → phone cross-device
- [ ] Scan tab TonyHere/`direct_post` smoke unchanged

- [ ] **Step 2: Add `.env.development.local.example` comment block for DC API demo**

- [ ] **Step 3: Execute E2E on physical device; record pass/fail in TASKS.md**

- [ ] **Step 4: Commit**

```bash
git add docs/TASKS.md .env.development.local.example
git commit -m "docs: DC API E2E validation checklist and env notes"
```

---

## Spec Coverage Self-Review

| Spec requirement | Task |
|---|---|
| digital-credentials.dev E2E | Task 11 |
| `dc_api` + `dc_api.jwt` | Task 5 |
| unsigned + signed | Task 2, 6 |
| same-device + cross-device | Task 7, 9 |
| Wallet-automatic trust | Task 2 |
| One biometric | Task 4, 8 |
| Scan/direct_post unchanged | Task 10 |
| mDL DeviceResponse DC handover | Task 3, 4 |
| ADR + CODEMAP + TASKS | Task 1, 8, 11 |
| No PII logging | All tasks (use wallet logger) |

## Suggested implementation order

1. Task 1 (ADR)  
2. Task 2 → 3 → 4 (trust + native crypto)  
3. Task 5 → 6 (TS response + orchestration)  
4. Task 7 → 8 (provider + UI)  
5. Task 9 (cross-device)  
6. Task 10 → 11 (tests + E2E)
