# Demo Interop VP Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OID4VP `direct_post.jwt` VP submission interoperate with arbitrary demo verifiers (TonyHere, Animo) by matching eudi-dev wire format and enabling a single demo interop profile.

**Architecture:** Add `EXPO_PUBLIC_WALLET_DEMO_INTEROP` profile that cascades permissive verifier trust and eudi-dev-compatible JWE behavior. Fix encryption recipient JWK parsing with lenient coordinate padding (eudi-dev debug path). Keep holder signing, MMKV, and biometric gates unchanged.

**Tech Stack:** React Native / Expo SDK 54, TypeScript, Jest, `@noble/curves` P-256, `react-native-quick-crypto` AES-GCM, existing `buildDirectPostFormBody` + `jweEcdhEs` stack.

## Global Constraints

- Respond in English in code comments and docs.
- Do not use customer org name in new identifiers.
- NativeWind only for any UI touched; no new `StyleSheet`.
- One biometric prompt per user action on signing path — do not add extra gates.
- Configurable policy values use `EXPO_PUBLIC_<NAME>` with fallback defaults; document in `.env.example`.
- Every caught error logs raw diagnostic before safe UI mapping.
- Demo interop must never activate in `eas.json` `production` profile.
- Lenient JWK padding applies to **verifier encryption JWK only**, not holder `k_cred` keys.
- SD-JWT `direct_post.jwt` must not include JWE `apu`/`apv` unless mDoc ISO path (out of scope).

## File Map

| File | Responsibility |
|------|----------------|
| `src/config/runtimeFlags.ts` | `readWalletDemoInteropEnabled()` |
| `src/config/oid4vcPeerTrustPolicy.ts` | Demo profile → trust-any verifier/issuer |
| `src/services/vp/clientIdInteropPolicy.ts` | Demo profile → x509 client_id schemes |
| `src/services/crypto/p256Identity.ts` | Lenient coord padding option on `p256JwkToPublicKey` |
| `src/services/vp/oid4vpResponseEncryption.ts` | Pass lenient flag when resolving enc JWK |
| `src/services/vp/directPostFormBody.ts` | Block `apv` when demo interop on |
| `src/screens/CredentialOfferClaimScreen.tsx` | Skip PID UI gate when demo interop on |
| `src/services/vp/presentationDiagnostics.ts` | `jwk_coord_padded` diagnostic field |
| `eas.json` | Add demo interop env to `development` + `preview` only |
| `.env.example` / `.env.development.local.example` | Document vars |

---

### Task 1: Demo Interop Flag

**Files:**
- Modify: `src/config/runtimeFlags.ts`
- Modify: `src/config/runtimeFlags.test.ts`
- Test: `src/config/runtimeFlags.test.ts`

**Interfaces:**
- Produces: `readWalletDemoInteropEnabled(isDevelopment?: boolean): boolean`

- [ ] **Step 1: Write the failing test**

Add to `src/config/runtimeFlags.test.ts`:

```typescript
import { readWalletDemoInteropEnabled } from './runtimeFlags'

// inside describe block, add afterEach restore for:
// EXPO_PUBLIC_WALLET_DEMO_INTEROP, EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP

test('enables demo interop only in development when flag is true', () => {
  process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
  delete process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP

  expect(readWalletDemoInteropEnabled(true)).toBe(true)
  expect(readWalletDemoInteropEnabled(false)).toBe(false)
})

test('allows demo interop outside __DEV__ only with explicit allow flag', () => {
  process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
  process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP = 'true'

  expect(readWalletDemoInteropEnabled(false)).toBe(true)
})

test('demo interop is off when master flag absent', () => {
  delete process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP
  expect(readWalletDemoInteropEnabled(true)).toBe(false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/config/runtimeFlags.test.ts -t "demo interop" --no-cache`
Expected: FAIL — `readWalletDemoInteropEnabled` is not defined

- [ ] **Step 3: Implement minimal flag reader**

Add to `src/config/runtimeFlags.ts`:

```typescript
export function readWalletDemoInteropEnabled(isDevelopment = __DEV__): boolean {
  if (process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP !== 'true') return false
  if (isDevelopment) return true
  return process.env.EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP === 'true'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test src/config/runtimeFlags.test.ts -t "demo interop" --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/runtimeFlags.ts src/config/runtimeFlags.test.ts
git commit -m "feat: add wallet demo interop runtime flag"
```

---

### Task 2: Demo Profile Trust Cascade

**Files:**
- Modify: `src/config/oid4vcPeerTrustPolicy.ts`
- Modify: `src/services/vp/clientIdInteropPolicy.ts`
- Modify: `src/config/oid4vcPeerTrustPolicy.test.ts`
- Test: `src/config/oid4vcPeerTrustPolicy.test.ts`

**Interfaces:**
- Consumes: `readWalletDemoInteropEnabled()` from Task 1
- Produces: updated `readTrustAnyOid4vcVerifierEnabled()` and `readTrustAnyOid4vcIssuerEnabled()` that return `true` when demo interop is on
- Produces: `readClientIdInteropEnabled(): boolean` used by `isClientIdSchemeSupportedForTrust`

- [ ] **Step 1: Write the failing tests**

In `oid4vcPeerTrustPolicy.test.ts`:

```typescript
test('demo interop profile enables verifier and issuer trust without peer flags', () => {
  delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER
  delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER
  delete process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER
  process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'

  expect(readTrustAnyOid4vcVerifierEnabled()).toBe(true)
  expect(readTrustAnyOid4vcIssuerEnabled()).toBe(true)
})
```

Add `src/services/vp/clientIdInteropPolicy.test.ts`:

```typescript
import { isClientIdSchemeSupportedForTrust } from './clientIdInteropPolicy'

describe('clientIdInteropPolicy', () => {
  const originalDemo = process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP

  afterEach(() => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = originalDemo
  })

  test('x509_hash is supported when demo interop is enabled', () => {
    process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
    expect(isClientIdSchemeSupportedForTrust('x509_hash', false)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn test src/config/oid4vcPeerTrustPolicy.test.ts src/services/vp/clientIdInteropPolicy.test.ts --no-cache`
Expected: FAIL on demo interop cases

- [ ] **Step 3: Implement cascade**

In `oid4vcPeerTrustPolicy.ts`, at top of each reader:

```typescript
import { readWalletDemoInteropEnabled } from './runtimeFlags'

export function readTrustAnyOid4vcVerifierEnabled(): boolean {
  if (readWalletDemoInteropEnabled()) return true
  return (
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER === 'true' ||
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_VERIFIER === 'true'
  )
}

export function readTrustAnyOid4vcIssuerEnabled(): boolean {
  if (readWalletDemoInteropEnabled()) return true
  return (
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_PEER === 'true' ||
    process.env.EXPO_PUBLIC_TRUST_ANY_OID4VC_ISSUER === 'true'
  )
}
```

In `clientIdInteropPolicy.ts`:

```typescript
import { readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'

function readClientIdInteropEnabled(trustAnyHttpsPeer: boolean): boolean {
  return trustAnyHttpsPeer || readWalletDemoInteropEnabled()
}

export function isClientIdSchemeSupportedForTrust(
  scheme: ParsedClientId['scheme'],
  trustAnyHttpsPeer: boolean,
): boolean {
  const interop = readClientIdInteropEnabled(trustAnyHttpsPeer)
  if (PERMANENTLY_UNSUPPORTED_CLIENT_ID_SCHEMES.has(scheme)) return false
  if (INTEROP_X509_CLIENT_ID_SCHEMES.has(scheme)) return interop
  return true
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/config/oid4vcPeerTrustPolicy.test.ts src/services/vp/clientIdInteropPolicy.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/config/oid4vcPeerTrustPolicy.ts src/config/oid4vcPeerTrustPolicy.test.ts src/services/vp/clientIdInteropPolicy.ts src/services/vp/clientIdInteropPolicy.test.ts
git commit -m "feat: cascade demo interop profile to peer trust policy"
```

---

### Task 3: Lenient Encryption JWK Coordinate Padding

**Files:**
- Modify: `src/services/crypto/p256Identity.ts`
- Modify: `src/services/vp/oid4vpResponseEncryption.ts`
- Modify: `src/services/crypto/p256Identity.test.ts`
- Test: `src/services/crypto/p256Identity.test.ts`

**Interfaces:**
- Produces: `p256JwkToPublicKey(jwk: EcP256Jwk, options?: { lenientCoordinates?: boolean }): Uint8Array`
- Produces: `readP256JwkCoordinatePaddingApplied(): boolean` (module-level last-call flag for diagnostics) **or** return `{ publicKey, coordinatePadded }` from a new `parseP256EncryptionJwk` helper — prefer explicit return type to avoid global state:

```typescript
export type P256JwkParseResult = {
  publicKey: Uint8Array
  coordinatePadded: boolean
}

export function parseP256JwkPublicKey(
  jwk: EcP256Jwk,
  options?: { lenientCoordinates?: boolean },
): P256JwkParseResult
```

Refactor `p256JwkToPublicKey` to call `parseP256JwkPublicKey` and return `.publicKey` (strict default).

- [ ] **Step 1: Write the failing test**

Add to `p256Identity.test.ts`:

```typescript
import { parseP256JwkPublicKey, p256PublicKeyToJwk } from './p256Identity'

test('lenient mode left-pads short EC coordinates for encryption JWK interop', () => {
  const fullJwk = p256PublicKeyToJwk(TEST_PUBLIC_KEY)
  const shortX = fullJwk.x!.slice(0, fullJwk.x!.length - 4) // drop trailing chars → shorter coord bytes

  const strict = () =>
    parseP256JwkPublicKey({ ...fullJwk, x: shortX }, { lenientCoordinates: false })
  expect(strict).toThrow('InvalidP256JwkCoordinateLength')

  const lenient = parseP256JwkPublicKey(
    { ...fullJwk, x: shortX },
    { lenientCoordinates: true },
  )
  expect(lenient.coordinatePadded).toBe(true)
  expect(lenient.publicKey).toEqual(TEST_PUBLIC_KEY)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test src/services/crypto/p256Identity.test.ts -t "lenient mode" --no-cache`
Expected: FAIL — `parseP256JwkPublicKey` not defined

- [ ] **Step 3: Implement lenient padding**

In `p256Identity.ts`, add helper and refactor:

```typescript
function padBase64UrlCoordinateTo32Bytes(value: string): { bytes: Uint8Array; padded: boolean } {
  const decoded = base64UrlDecode(value)
  if (decoded.length === 32) return { bytes: decoded, padded: false }
  if (decoded.length > 32) throw new Error('InvalidP256JwkCoordinateLength')
  const bytes = new Uint8Array(32)
  bytes.set(decoded, 32 - decoded.length)
  return { bytes, padded: true }
}

export function parseP256JwkPublicKey(
  jwk: EcP256Jwk,
  options?: { lenientCoordinates?: boolean },
): P256JwkParseResult {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
    throw new Error('InvalidP256Jwk')
  }

  const xResult = options?.lenientCoordinates
    ? padBase64UrlCoordinateTo32Bytes(jwk.x)
    : (() => {
        const bytes = base64UrlDecode(jwk.x)
        if (bytes.length !== 32) throw new Error('InvalidP256JwkCoordinateLength')
        return { bytes, padded: false }
      })()

  const yResult = options?.lenientCoordinates
    ? padBase64UrlCoordinateTo32Bytes(jwk.y)
    : (() => {
        const bytes = base64UrlDecode(jwk.y)
        if (bytes.length !== 32) throw new Error('InvalidP256JwkCoordinateLength')
        return { bytes, padded: false }
      })()

  const uncompressed = new Uint8Array(65)
  uncompressed[0] = 0x04
  uncompressed.set(xResult.bytes, 1)
  uncompressed.set(yResult.bytes, 33)

  return {
    publicKey: compressP256PublicKey(uncompressed),
    coordinatePadded: xResult.padded || yResult.padded,
  }
}

export function p256JwkToPublicKey(jwk: EcP256Jwk): Uint8Array {
  return parseP256JwkPublicKey(jwk).publicKey
}
```

In `oid4vpResponseEncryption.ts`, when demo interop is on, validate coords via lenient parse before building JWK:

```typescript
import { readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'
import { parseP256JwkPublicKey } from '@/src/services/crypto/p256Identity'

// inside readP256EcdhEsRecipientJwk, after reading x/y:
if (readWalletDemoInteropEnabled()) {
  const parsed = parseP256JwkPublicKey(
    { kty: 'EC', crv: 'P-256', x, y },
    { lenientCoordinates: true },
  )
  if (parsed.coordinatePadded) {
    logWalletStep('oid4vp', 'encryption-jwk-coordinate-padded', { kid: readString(key.kid) })
  }
}
// continue building jwk with original x/y strings (wire unchanged; only EC point decode is lenient)
```

Also thread lenient flag into `encryptCompactJweEcdhEsP256` call path: update `jweEcdhEs.ts` to accept `lenientRecipientCoordinates?: boolean` on `recipientJwk` parse, OR parse in `oid4vpResponseEncryption` only (encryption already uses x/y strings in header; shared secret uses `p256JwkToPublicKey` inside `jweEcdhEs.ts`).

**Required:** Update `jweEcdhEs.ts` `encryptCompactJweEcdhEsP256` to accept optional `lenientRecipientCoordinates` and pass to `parseP256JwkPublicKey` instead of `p256JwkToPublicKey`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/services/crypto/p256Identity.test.ts src/services/crypto/jweEcdhEs.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/crypto/p256Identity.ts src/services/crypto/p256Identity.test.ts src/services/crypto/jweEcdhEs.ts src/services/vp/oid4vpResponseEncryption.ts
git commit -m "feat: lenient P-256 encryption JWK padding for demo interop"
```

---

### Task 4: Direct Post JWE Guard + DCQL Payload Tests

**Files:**
- Modify: `src/services/vp/directPostFormBody.ts`
- Modify: `src/services/vp/directPostFormBody.test.ts`
- Test: `src/services/vp/directPostFormBody.test.ts`

**Interfaces:**
- Consumes: `readWalletDemoInteropEnabled()`, `shouldIncludeOid4vpJweApv()`

- [ ] **Step 1: Write the failing tests**

Add to `directPostFormBody.test.ts`:

```typescript
test('demo interop ignores EXPO_PUBLIC_OID4VP_JWE_APV even when set', () => {
  process.env.EXPO_PUBLIC_WALLET_DEMO_INTEROP = 'true'
  process.env.EXPO_PUBLIC_OID4VP_JWE_APV = 'true'

  const vpEnvelope = JSON.stringify({ q1: ['vp.jwt'] })
  const body = buildDirectPostFormBody({
    request: {
      responseMode: 'direct_post.jwt',
      responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
      state: 's1',
      nonce: 'nonce-1',
      dcqlQuery: { credentials: [{ id: 'q1' }] },
    },
    formattedVpToken: vpEnvelope,
  })

  const header = JSON.parse(
    Buffer.from(body.get('response')!.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
  )
  expect(header.apv).toBeUndefined()
  expect(header.apu).toBeUndefined()
})

test('encrypted DCQL payload stores vp_token as object without presentation_submission', () => {
  delete process.env.EXPO_PUBLIC_OID4VP_JWE_APV
  const vpEnvelope = JSON.stringify({ q1: ['vp.jwt'] })
  const body = buildDirectPostFormBody({
    request: {
      responseMode: 'direct_post.jwt',
      responseEncryption: { alg: 'ECDH-ES', enc: 'A128GCM', jwk: publicJwk },
      state: 's1',
      dcqlQuery: { credentials: [{ id: 'q1' }] },
    },
    formattedVpToken: vpEnvelope,
  })

  const decrypted = decryptCompactJweEcdhEsP256ForTest(body.get('response')!, privateKey)
  expect(decrypted.vp_token).toEqual({ q1: ['vp.jwt'] })
  expect(decrypted.presentation_submission).toBeUndefined()
  expect(decrypted.state).toBe('s1')
})
```

- [ ] **Step 2: Run tests to verify failure**

Run: `yarn test src/services/vp/directPostFormBody.test.ts -t "demo interop ignores" --no-cache`
Expected: FAIL — `apv` present when flag set

- [ ] **Step 3: Implement demo apv guard**

In `directPostFormBody.ts`:

```typescript
import { readWalletDemoInteropEnabled } from '@/src/config/runtimeFlags'

// replace includeJweApv assignment:
const includeJweApv =
  shouldIncludeOid4vpJweApv() && !readWalletDemoInteropEnabled()
```

Also pass `lenientRecipientCoordinates: readWalletDemoInteropEnabled()` into `encryptCompactJweEcdhEsP256` (from Task 3).

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn test src/services/vp/directPostFormBody.test.ts --no-cache`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/vp/directPostFormBody.ts src/services/vp/directPostFormBody.test.ts
git commit -m "fix: enforce eudi-dev JWE wire format under demo interop profile"
```

---

### Task 5: PID Claim Gate + Env / EAS Wiring

**Files:**
- Modify: `src/screens/CredentialOfferClaimScreen.tsx`
- Modify: `.env.example`
- Modify: `.env.development.local.example`
- Modify: `eas.json`
- Modify: `docs/TASKS.md`

**Interfaces:**
- Consumes: `readWalletDemoInteropEnabled()` or `readTrustAnyOid4vcIssuerEnabled()` (already cascades)

- [ ] **Step 1: Update PID gate condition**

In `CredentialOfferClaimScreen.tsx`, change:

```typescript
if (!isPidOffer && pidGateStatus !== 'ready' && !readTrustAnyOid4vcIssuerEnabled()) {
```

No test change required if `readTrustAnyOid4vcIssuerEnabled` already cascades demo profile (Task 2). Optionally add one line to existing `CredentialOfferClaimScreen.test.tsx` if present.

- [ ] **Step 2: Document env vars**

`.env.example`:

```
# Demo interop profile: permissive verifier/issuer trust + eudi-dev-compatible VP submit wire format.
# Active only in __DEV__ unless EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP=true (preview/internal builds only).
# EXPO_PUBLIC_WALLET_DEMO_INTEROP=true
# EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP=true
```

`.env.development.local.example`:

```
EXPO_PUBLIC_WALLET_DEMO_INTEROP=true
```

- [ ] **Step 3: Wire EAS profiles**

In `eas.json`, add to `development.env` and `preview.env` only:

```json
"EXPO_PUBLIC_WALLET_DEMO_INTEROP": "true",
"EXPO_PUBLIC_ALLOW_NON_DEV_DEMO_INTEROP": "true"
```

Do **not** add to `production.env`.

- [ ] **Step 4: Update TASKS.md**

Add completed-slice entry referencing spec `docs/superpowers/specs/2026-08-25-demo-interop-vp-submit-design.md` and manual acceptance targets (TonyHere, Animo VP).

- [ ] **Step 5: Commit**

```bash
git add src/screens/CredentialOfferClaimScreen.tsx .env.example .env.development.local.example eas.json docs/TASKS.md
git commit -m "chore: wire demo interop profile into dev/preview env"
```

---

### Task 6: Diagnostics + Full Verification

**Files:**
- Modify: `src/services/vp/presentationDiagnostics.ts`
- Modify: `src/services/vp/presentationDiagnostics.test.ts`
- Test: full suite subset

**Interfaces:**
- Produces: `jwk_coord_padded=` field in `describeEncryptedSubmitAttempt` when `input.jwkCoordPadded === true`

- [ ] **Step 1: Write failing diagnostic test**

```typescript
test('describeEncryptedSubmitAttempt reports jwk_coord_padded when set', () => {
  const summary = describeEncryptedSubmitAttempt({
    request: { responseMode: 'direct_post.jwt', protocolPath: 'legacy', state: 's1' },
    formattedVpToken: JSON.stringify({ q1: ['vp'] }),
    compactJwe: 'eyJhbGciOiJFQ0RILUVTIn0..iv.ct.tag',
    jwkCoordPadded: true,
  })
  expect(summary).toContain('jwk_coord_padded=true')
})
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test src/services/vp/presentationDiagnostics.test.ts -t "jwk_coord_padded" --no-cache`

- [ ] **Step 3: Implement diagnostic field**

Extend `describeEncryptedSubmitAttempt` input and append `jwk_coord_padded=${Boolean(input.jwkCoordPadded)}` to summary array.

Thread `jwkCoordPadded` from submit error path in `presentationService.ts` when encryption JWK padding was applied (pass through `resolveOid4vpResponseEncryptionParams` return or a request-scoped flag on `ResolvedPresentationRequest`).

- [ ] **Step 4: Run full verification**

```bash
yarn test src/config/runtimeFlags.test.ts src/config/oid4vcPeerTrustPolicy.test.ts src/services/vp/clientIdInteropPolicy.test.ts src/services/crypto/p256Identity.test.ts src/services/crypto/jweEcdhEs.test.ts src/services/vp/directPostFormBody.test.ts src/services/vp/presentationDiagnostics.test.ts --no-cache
yarn tsc --noEmit
yarn lint
```

Expected: all PASS, no type errors

- [ ] **Step 5: Manual device acceptance**

| Step | Action | Pass |
|------|--------|------|
| 1 | Build dev client with demo interop env | App starts |
| 2 | Scan TonyHere verifier QR, approve, submit | HTTP 200 |
| 3 | Scan Animo playground VP QR, approve, submit | No JARM decrypt error |
| 4 | Claim credential from Animo (regression) | Still succeeds |

- [ ] **Step 6: Commit**

```bash
git add src/services/vp/presentationDiagnostics.ts src/services/vp/presentationDiagnostics.test.ts src/services/vp/presentationService.ts src/services/vp/oid4vpResponseEncryption.ts
git commit -m "feat: add demo interop VP submit diagnostics"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| `readWalletDemoInteropEnabled()` dev/preview only | Task 1, 5 |
| Trust-any verifier + x509 schemes | Task 2 |
| Lenient enc JWK padding | Task 3 |
| No JWE apv for SD-JWT demo path | Task 4 |
| DCQL object inside JWE, no presentation_submission | Task 4 (test) |
| PID UI gate skip | Task 5 |
| Diagnostics jwe_apv + jwk_coord_padded | Task 4, 6 |
| Env + EAS documentation | Task 5 |
| TonyHere + Animo manual acceptance | Task 6 |

## Placeholder Scan

No TBD/TODO/"implement later" steps. All code blocks are complete starter implementations.
