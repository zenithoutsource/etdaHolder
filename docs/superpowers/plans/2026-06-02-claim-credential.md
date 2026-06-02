# Claim Credential Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `claimCredential()` for Phase 2.3 OID4VCI Pre-Authorized Code credential acquisition.

**Architecture:** Keep Phase 2.3 in `src/services/vci/exchangeService.ts` beside `resolveOffer()`. Add small dependency seams for protocol exchange, signing, and storage so TypeScript contract tests can verify behavior without network, biometrics, or native MMKV.

**Tech Stack:** Expo SDK 54, TypeScript, Hermes, `@sphereon/oid4vci-client`, `@sphereon/oid4vci-common`, `react-native-mmkv`, `react-native-quick-crypto`.

---

## File Structure

- Modify: `src/services/vci/exchangeService.ts`
  - Add `VerifiableCredentialRecord`, `ClaimCredentialOptions`, `ClaimCredentialDependencies`.
  - Add `claimCredential()`.
  - Add JWT decoding, date normalization, storage helpers, and default Sphereon adapter.
- Modify: `src/services/vci/exchangeService.test.ts`
  - Extend TypeScript contract with fake protocol/storage/signer dependencies.
- Modify: `docs/TASKS.md`
  - Mark Phase 2.3 completed items that are implemented.

---

### Task 1: Contract Test For Required `tx_code`

**Files:**
- Modify: `src/services/vci/exchangeService.test.ts`

- [ ] **Step 1: Write failing contract code**

Add this below existing `contract()` function:

```ts
async function txCodeContract(): Promise<void> {
  const resolved = await contract()

  await claimCredential(resolved, {
    dependencies: {
      acquireCredential: async () => {
        throw new Error('should not acquire without tx_code')
      },
      signProof: async () => 'proof.jwt',
      getCredentialStorage: () => ({
        getString: () => undefined,
        set: () => undefined,
      }),
    },
  })
}

void txCodeContract()
```

Import `claimCredential` from `./exchangeService`.

- [ ] **Step 2: Run TypeScript and verify RED**

Run: `yarn.cmd tsc --noEmit`

Expected: FAIL because `claimCredential` is not exported.

- [ ] **Step 3: Implement minimal exported API**

In `src/services/vci/exchangeService.ts`, add placeholder types and function that throws `TransactionCodeRequired` when `resolvedOffer.txCode` exists and `options.tx_code` is missing.

- [ ] **Step 4: Run TypeScript and verify GREEN**

Run: `yarn.cmd tsc --noEmit`

Expected: PASS.

---

### Task 2: Contract Test For Pre-Authorized Only

**Files:**
- Modify: `src/services/vci/exchangeService.test.ts`
- Modify: `src/services/vci/exchangeService.ts`

- [ ] **Step 1: Write failing contract code**

Add:

```ts
async function unsupportedFlowContract(): Promise<void> {
  const resolved = await contract()
  const withoutPreAuth = { ...resolved, preAuthorizedCode: undefined }

  await claimCredential(withoutPreAuth, {
    tx_code: '123456',
    dependencies: {
      acquireCredential: async () => {
        throw new Error('should not acquire unsupported flow')
      },
      signProof: async () => 'proof.jwt',
      getCredentialStorage: () => ({
        getString: () => undefined,
        set: () => undefined,
      }),
    },
  })
}

void unsupportedFlowContract()
```

- [ ] **Step 2: Run TypeScript and verify RED**

Run: `yarn.cmd tsc --noEmit`

Expected: FAIL if option/dependency types are incomplete or behavior cannot compile.

- [ ] **Step 3: Implement minimal pre-authorized validation**

Throw `CredentialFlowUnsupported: Pre-Authorized Code flow is required` if `resolvedOffer.preAuthorizedCode` is missing.

- [ ] **Step 4: Run TypeScript and verify GREEN**

Run: `yarn.cmd tsc --noEmit`

Expected: PASS.

---

### Task 3: Contract Test For JWT Normalization And Storage

**Files:**
- Modify: `src/services/vci/exchangeService.test.ts`
- Modify: `src/services/vci/exchangeService.ts`

- [ ] **Step 1: Write failing contract code**

Add helper:

```ts
function unsignedJwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`
}
```

Add contract:

```ts
async function claimCredentialContract(): Promise<VerifiableCredentialRecord> {
  const resolved = await contract()
  const writes = new Map<string, string>()
  const vc = unsignedJwt({
    jti: 'vc-123',
    iat: 1760000000,
    exp: 1760003600,
    vc: {
      type: ['VerifiableCredential', 'ThaiNationalID'],
      credentialSubject: { givenName: 'Ada' },
    },
  })

  return claimCredential(resolved, {
    tx_code: '123456',
    dependencies: {
      acquireCredential: async ({ proof }) => {
        if (proof !== 'proof.jwt') throw new Error('proof not passed')
        return vc
      },
      signProof: async (nonce, audience) => {
        if (nonce !== 'nonce-1') throw new Error('nonce not passed')
        if (audience !== 'https://issuer.example.com') throw new Error('audience not passed')
        return 'proof.jwt'
      },
      getCredentialStorage: () => ({
        getString: (key: string) => writes.get(key),
        set: (key: string, value: string) => {
          writes.set(key, value)
        },
      }),
    },
  })
}

void claimCredentialContract()
```

Import `VerifiableCredentialRecord`.

- [ ] **Step 2: Run TypeScript and verify RED**

Run: `yarn.cmd tsc --noEmit`

Expected: FAIL because normalization/storage behavior is missing or dependency signature is incomplete.

- [ ] **Step 3: Implement normalization/storage**

Add:

```ts
const CREDENTIAL_INDEX_KEY = 'credential:index'
const CREDENTIAL_KEY_PREFIX = 'credential:'
```

Implement JWT payload decode, ID/type/date normalization, `storeCredentialRecord()`, and index dedupe.

- [ ] **Step 4: Run TypeScript and verify GREEN**

Run: `yarn.cmd tsc --noEmit`

Expected: PASS.

---

### Task 4: Default Sphereon Adapter

**Files:**
- Modify: `src/services/vci/exchangeService.ts`

- [ ] **Step 1: Write failing contract shape**

Add a TypeScript-only call in test with no dependencies:

```ts
async function defaultDependenciesContract(): Promise<VerifiableCredentialRecord> {
  const resolved = await contract()
  return claimCredential(resolved, { tx_code: '123456' })
}
```

Do not execute it with `void`; this only checks API shape.

- [ ] **Step 2: Run TypeScript and verify RED**

Run: `yarn.cmd tsc --noEmit`

Expected: FAIL if default dependencies are missing.

- [ ] **Step 3: Implement defaults**

Wire default `signProof` to `src/services/crypto/crypto.ts`, default storage to `getCredentialStorage()`, and default acquisition to Sphereon. Prefer Sphereon credential request APIs. If Sphereon proof callback cannot fit hardware-signed JWT cleanly, use manual token/credential fetch only inside the default adapter while keeping public service boundary unchanged.

- [ ] **Step 4: Run TypeScript and verify GREEN**

Run: `yarn.cmd tsc --noEmit`

Expected: PASS.

---

### Task 5: Documentation And Verification

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Update Phase 2.3 checklist**

Mark implemented Phase 2.3 items `[x]`. Leave backend sync Phase 2.4 unchecked.

- [ ] **Step 2: Run full verification**

Run: `yarn.cmd tsc --noEmit`

Expected: PASS.

Run: `yarn.cmd lint`

Expected: PASS.

- [ ] **Step 3: Check worktree**

Run: `git status --short`

Expected: only intended files changed plus pre-existing unrelated dirty files.

---

## Self-Review

- Spec coverage: Covers input shape, Pre-Authorized Code only, `tx_code`, PoP signing, JWT-only response, normalization, encrypted MMKV storage, return value, docs update, and verification.
- Placeholder scan: No placeholder work remains. Backend sync and issuer signature validation are explicitly out of scope.
- Type consistency: Public types and dependency names are consistent across tasks.
