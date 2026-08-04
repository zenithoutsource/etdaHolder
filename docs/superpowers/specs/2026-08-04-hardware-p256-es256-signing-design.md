# Hardware P-256 / ES256 Production Signing

> **Date:** 2026-08-04  
> **Status:** Approved for implementation planning (revised after third grill pass)  
> **Supersedes (when implemented):** ADR 0008 (Keychain-protected software Ed25519) as the production **holder** signing algorithm and storage model  
> **Updates:** ADR 0001 (hardware non-extractable restored for protocol holder keys); ADR 0010 (topology kept; algorithm/storage becomes hardware P-256)  
> **Related:** Stakeholder decision that EdDSA is no longer required for holder keys; Issuer/Verifier accept ES256 for holder proofs; target device Samsung Galaxy A26  
> **Review input:** Independent grill ([spec review chat](7c08c567-c485-43b0-b406-8e4ef816d18f)); biometric = action-scoped session; iOS production blocked; migration = fresh reissue with no old-key proof

## Summary

Replace production **holder** signing (**EdDSA / Ed25519** Keychain software seeds per ADR 0008 / 0010) with **hardware non-extractable P-256** keys and wire algorithm **`alg: ES256`**.

- **Curve / key:** P-256 (`secp256r1`)
- **JWT alg (holder):** ES256; JWS sig = **64-byte `r‖s`**
- **Storage:** AndroidKeyStore; **StrongBox-first at key creation** with TEE fallback only on **explicit** StrongBox unavailability; **no software private keys**
- **Topology:** Keep ADR 0010 — `k_attest` + one `k_cred` per credential. **Bind does not rename Keystore aliases** (encrypted registry maps `credentialId → existing alias`).
- **Biometric:** One prompt per user action via a short **native action-scoped signing session** with a **non-zero Android auth validity window**; app/native TTLs aligned; `close()` is best-effort (cannot revoke the hardware auth token early — residual exposure documented).
- **Verify path:** Algorithm **allowlist** — holder ES256 must **not** strip EdDSA verification for issuer credentials or verifier JARs that still use EdDSA.
- **Proximity:** ISO 18013-5 device auth signs **natively during HCE/APDU** using an **opaque session handle only** (handle bound internally to alias / purpose / expiry / max signatures); no TypeScript round-trip at tap time; no raw seed handoff.
- **mdoc COSE_Key (P-256):** locked `{1: 2, 3: -7, -1: 1, -2: x, -3: y}`.
- **Attestation:** Android attestation challenge is supplied at **`createKey`**, not a post-hoc `attestKey(alias, challenge)`.
- **Platform:** **Android-only production** until iOS Secure Enclave lands; iOS issuance/presentation is **blocked**.
- **Migration:** Fresh issuer **reissue requiring no old-key proof**; legacy Ed25519 deletion is **per credential / per alias** after that credential’s validated re-issue + presentation. No migration-only legacy signing path.
- **Native stack:** Animo spike is a real **go/no-go** against the full contract; own AndroidKeyStore module if unmet.

## Problem

ADR 0007/0008 adopted Ed25519 because the customer required `alg: EdDSA` for holder proofs. Target Android devices could not provide hardware-backed Ed25519 through AndroidKeyStore, so production fell back to Keychain-protected **software** seeds. That satisfies protocol EdDSA but violates the preferred ADR 0001 hardware non-extractable model.

The stakeholder now accepts **P-256 / ES256 for holder signing**. Android StrongBox’s documented baseline includes P-256, so the wallet can return to hardware-backed holder signing without keeping an EdDSA **software holder** path. Issuer/Verifier **signature verification** remains multi-alg until the ecosystem fully drops EdDSA on those surfaces.

## Goals

1. Protocol holder keys (`k_attest`, each `k_cred`) are generated and used in hardware; JS never receives private key bytes.
2. Prefer StrongBox at **key creation**; TEE fallback only when StrongBox reports an **explicit availability error** (e.g. `StrongBoxUnavailableException`); fail closed otherwise. Never create a different key on sign failure or on generic keygen errors.
3. Emit holder proofs with **`alg: ES256`** (OID4VCI PoP, OID4VP / SD-JWT KB-JWT, wallet attestation signing, mdoc device auth).
4. Preserve ADR 0010 lifecycle with alias-stable bind in **encrypted** registry storage; destroy on renewal/revoke/delete; **one biometric prompt per user action** via action-scoped signing session.
5. Preserve dual-format issuance: one pending key and one proof-signing **session** for `dc+sd-jwt` + `mso_mdoc` (and fresh-nonce retries inside that session).
6. Keep trust/credential **verification** on an explicit algorithm allowlist (ES256 + EdDSA while ecosystem still emits EdDSA).
7. Migrate existing credentials via **fresh issuer reissue with no old-key presentation/signing** (avoids renewal deadlock with blocked legacy signing).
8. Gate production cutover on Galaxy A26 physical evidence (StrongBox P-256, explicit-StrongBox TEE fallback, capacity stress, E2E issue/present/proximity).
9. Block iOS production issuance/presentation until a Secure Enclave slice lands.
10. Document the decision in a new ADR and update SECURITY.md / TASKS.md / ADR 0010 algorithm notes.

## Non-goals

- Keeping a production EdDSA / Ed25519 **holder signer** after cutover.
- A temporary **migration-only** legacy Ed25519 signing path for old-key renewal proofs.
- Software P-256 (or any software private key) as a production fallback.
- Soft dual-alg **holder** migration (present old Ed25519-bound credentials indefinitely alongside new ES256 holder keys).
- Forcing all issuer/verifier JWTs to ES256 in the same slice (verification allowlist handles coexistence).
- Shipping iOS production holder crypto in this slice (blocked until Secure Enclave ADR/implementation).
- Changing OID4VCI client boundary (still on-device Sphereon), card UI config model, or company API SDK path.
- Requiring StrongBox on every SKU with no TEE create fallback.
- Treating cached `securityLevelHint` as authoritative proof of hardware backing.
- Assuming `close()` immediately invalidates Android’s hardware authentication token.
- Post-hoc attestation challenges on already-generated keys (`attestKey(alias, challenge)`).

## Terminology

| Term | Meaning |
|------|---------|
| **P-256** | Elliptic curve (`secp256r1` / `prime256v1`) for the key |
| **ES256** | JWA/JWT algorithm: ECDSA using P-256 and SHA-256; JWS signature is **64-byte `r‖s`** (IEEE P1363 / JOSE) |
| **StrongBox** | Android Keystore security level `STRONGBOX` |
| **TEE** | Android Keystore security level `TRUSTED_ENVIRONMENT` |
| **Action-scoped signing session** | Native session for one user action: one biometric unlock, then multiple hardware signs until app TTL expiry / `close()` (hardware auth window may outlive `close()` — see residual exposure) |
| **Opaque session handle** | Native-only handle bound to alias, purpose, expiry, and max signature count; proximity receives the handle alone |
| **Fresh reissue** | Issuer issues a new credential bound to a new hardware key without requiring presentation/signing with the previous credential key |

## Decision drivers (locked)

| Topic | Decision |
|-------|----------|
| Holder signing | Hardware P-256 / `alg: ES256` everywhere the wallet signs (Android) |
| Trust / issuer verification | Explicit alg allowlist; do **not** remove EdDSA verify solely because holder moved to ES256 |
| Private keys | Hardware only; StrongBox-first **at create**; TEE only on **explicit** StrongBox unavailability; never software |
| Biometric vs CryptoObject | **One prompt wins** — action-scoped session with non-zero Android auth validity window |
| Migration | Fresh issuer reissue **without old-key proof**; legacy delete **per credential/alias** after validated cutover |
| Key topology | Keep ADR 0010; bind = encrypted registry map only (no Keystore rename) |
| Registry storage | Encrypted MMKV (not unencrypted meta storage) |
| Attestation | Challenge at `createKey`; return cert chain from create when requested |
| Native stack | Animo spike is go/no-go; custom module if contract unmet |
| Platform | Android Galaxy A26 first; **iOS production blocked** until Secure Enclave |
| Ecosystem (holder proofs) | Issuer/Verifier already accept ES256 holder proofs |
| `did:key` | Locked: multicodec `varint(0x1200) = [0x80, 0x24]` + 33-byte compressed P-256 public key |
| mdoc COSE_Key | Locked: `{1: 2, 3: -7, -1: 1, -2: x, -3: y}` |

## Architecture

### Approach

**Hardware signer facade + Animo spike → production cutover** (Approach 1).

1. Introduce TypeScript `HardwareEcdsaSigner` as the only protocol private-key API for online flows.
2. Spike Animo on A26 against the full contract (StrongBox selection, `KeyInfo` security level, delete, action-scoped session with auth-validity params, JOSE `r‖s`, opaque session handle with internal bindings, attestation-at-create). Public Animo docs today cover P-256 + biometrics but **not** StrongBox selection, security-level reporting, deletion, or action-scoped sessions — spike outcome decides backend.
3. If Animo cannot satisfy the contract, implement a local Expo Android module wrapping AndroidKeyStore P-256 with the same facade.
4. Rewire `walletAttestKey`, `credentialSigningKey`, `crypto.ts`, and mdoc proximity engine to hardware aliases + native session handles.
5. Replace old-key renewal presentation for cutover with **fresh reissue** UX/issuer contract (no old-key PoP/VP).
6. After A26 E2E + capacity gates pass: hard cutover of Android holder signing; new ADR supersedes ADR 0008 for production **holder** signing.
7. iOS builds fail closed for issuance/presentation until Secure Enclave work ships.

### Layers

```text
OID4VCI / OID4VP / Attest (JS)
        ↓
crypto.ts + credentialSigningKey + walletAttestKey
        ↓
HardwareEcdsaSigner (TS facade)
        ↓
Animo  OR  own AndroidKeyStore module
        ↓
AndroidKeyStore P-256 (StrongBox → explicit-unavailable TEE → fail closed)

Proximity HCE/APDU (native only at tap)
        ↓
opaque session handle → native sign (alias resolved inside native bind; no TS round-trip)

Trust verify (JAR / issuer VC) ──→ alg allowlist verifier (ES256 + EdDSA as configured)
```

### Facade contract

```ts
type HardwareSecurityLevel = 'STRONGBOX' | 'TEE'

interface EcP256Jwk {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

interface CreateKeyOptions {
  /**
   * Android KeyGenParameterSpec attestation challenge. Required when Wallet
   * Provider (or policy) needs a hardware attestation certificate chain.
   * Cannot be applied later to an existing key — regenerate instead.
   */
  attestationChallenge?: Uint8Array
}

interface CreateKeyResult {
  publicJwk: EcP256Jwk
  securityLevel: HardwareSecurityLevel
  /** Present when attestationChallenge was supplied and attestation succeeded. */
  certificateChainDer?: Uint8Array[]
}

interface HardwareEcdsaSigner {
  /**
   * StrongBox-first. TEE retry ONLY when native throws an explicit StrongBox
   * availability error (e.g. StrongBoxUnavailableException). Generic keygen
   * failures fail closed — do not silently fall back.
   * Attestation challenge (if any) is applied at generation time.
   */
  createKey(alias: string, options?: CreateKeyOptions): Promise<CreateKeyResult>

  getPublicJwk(alias: string): Promise<EcP256Jwk>

  /** Authoritative: read KeyInfo from native; do not trust MMKV cache alone. */
  getSecurityLevel(alias: string): Promise<HardwareSecurityLevel>

  /**
   * Open one user-action session:
   * - Key generated with user-authentication required + non-zero
   *   setUserAuthenticationValidityDurationSeconds (or API-equivalent),
   *   aligned with EXPO_PUBLIC_* app session TTL.
   * - One biometric prompt; then multiple sign() calls until app TTL / close()
   *   or maxSignatures.
   * - Returns opaqueNativeHandle bound internally to { alias, purpose, expiry,
   *   maxSignatures }. Proximity receives the handle only.
   * Residual exposure: Android may allow signs until the hardware validity
   * window elapses even after close(); document and keep TTLs short/aligned.
   */
  openSigningSession(
    alias: string,
    options: { purpose: 'oid4vci' | 'oid4vp' | 'mdoc' | 'attest'; maxSignatures: number },
  ): Promise<HardwareSigningSession>

  deleteKey(alias: string): Promise<void>
}

interface HardwareSigningSession {
  /**
   * Opaque handle for native proximity / HCE.
   * Native layer resolves alias/purpose/expiry/maxSignatures from this handle.
   * JS must not pass a separate alias that could disagree with the bind.
   */
  opaqueNativeHandle: string

  /** JOSE ES256 signature: exactly 64-byte r‖s (P1363). Not DER. */
  sign(data: Uint8Array): Promise<Uint8Array>

  /**
   * Ends the app-level session. Does NOT guarantee immediate revocation of
   * Android’s hardware auth token; validity window is the hard bound.
   */
  close(): Promise<void>
}
```

**Sign-failure rule:** If `sign()` fails for an existing alias, **fail closed**. Do **not** create a replacement key during sign.

**StrongBox fallback rule:** Catch only explicit StrongBox-availability failures when deciding to retry without StrongBox. Invalid params, attestation errors, or other keygen failures must not trigger TEE fallback.

**Attestation rule:** Challenge is only accepted at `createKey`. Keys created without a challenge cannot later produce an attestation chain for that challenge; regenerate with `attestationChallenge` if WP requires it.

### Key aliases and registry

Android Keystore aliases are **immutable** after creation. “Bind” never renames.

| Key | Alias lifecycle | Used for | Destroyed |
|-----|-----------------|----------|-----------|
| `k_attest` | Stable alias e.g. `wallet.p256.attest` | WUA/WIA (+ attestation chain from create when challenged) | Wallet reset / reinstall |
| `k_cred` | Random pending alias at create, e.g. `wallet.p256.cred.pending.{uuid}` | Issuance PoP before/after `credentialId` exists | Timeout GC, failure cleanup, or lifecycle destroy |
| Bind | **No rename** — encrypted registry `credentialId → { alias: <pending alias>, ... }` | Lookup for presentation / renew / destroy | — |

**Registry storage:** `credentialId → alias` mappings (and associated `holderDid` / `credentialType` / timestamps / `securityLevelHint`) MUST live in **encrypted MMKV** (same class of store as credentials), **not** unencrypted meta storage.

```text
credentialId → {
  holderDid,
  alias,              // exact Keystore alias created at pending time
  credentialType,
  createdAt,
  securityLevelHint   // cached at create for UX/diagnostics only
}
```

Call sites that need assurance must call `getSecurityLevel(alias)` (native `KeyInfo`).

### Identity shapes

- **Public JWK:** `{ "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }`
- **Holder `did:key`:** `did:key:z` + base58btc( multicodec_prefix ‖ compressed_pubkey ) where multicodec prefix is **`varint(0x1200) = [0x80, 0x24]`** and compressed pubkey is **33 bytes**
- **JWT / KB-JWT headers:** `alg: ES256`; signature bytes are JOSE **64-byte `r‖s`**
- **mdoc COSE_Key (P-256 EC2):** `{1: 2, 3: -7, -1: 1, -2: x, -3: y}` where `x`/`y` are the 32-byte coordinate bytes

### Proximity / mdoc

1. Before the NFC session, JS opens an action-scoped signing session with `purpose: 'mdoc'` and an appropriate `maxSignatures`.
2. JS passes **only** `opaqueNativeHandle` (plus non-secret presentation inputs) into the proximity native module — **not** a separate alias.
3. During HCE/APDU device auth, the proximity module signs **entirely in native code** using the handle’s internal bind — **no TypeScript round-trip at tap time**.
4. Native rejects the handle if purpose ≠ mdoc, expired, or signature count exceeded.
5. Raw Ed25519 (or any) seed handoff to the proximity module is removed from the production path.
6. Device public key encoding uses the locked P-256 COSE_Key map above.

### `k_attest` and remote attestation

- When WP requires hardware attestation, call `createKey(alias, { attestationChallenge })` and send `certificateChainDer` with WUA/WIA.
- If WP currently only consumes the public JWK, omit `attestationChallenge` and document that interim contract.
- Changing attestation requirements later means **regenerating** `k_attest` (and repeating activation), not calling a post-create attest API.

### Platform gate (iOS)

Until Secure Enclave P-256 work is specified and implemented:

- Production/preview iOS builds **block** credential issuance and presentation that require holder signing.
- No software-key exception on iOS to “keep the demo working.”

## Data flow

### Activation

1. Create hardware `k_attest` with optional `attestationChallenge` (StrongBox-first; TEE only on explicit StrongBox unavailability).
2. Persist public metadata + `securityLevelHint` in encrypted storage as appropriate; revalidate via native when needed.
3. Complete WUA/WIA with public JWK and attestation chain when present.
4. Set operational/activation gate only after attest succeeds.
5. Mark Ed25519-bound credentials as requiring **fresh reissue**; do not use legacy seeds for new protocol ops; do not offer old-key renewal proofs for cutover.

### Issuance (including cutover reissue)

1. `createPendingCredentialKey()` → `createKey(randomPendingAlias)` (attestation challenge only if policy requires per-cred attestation — default is public JWK / PoP only).
2. `openSigningSession(alias, { purpose: 'oid4vci', maxSignatures })` → one biometric → sign dual-format PoPs / nonce retries with `alg: ES256` → `close()`.
3. On successful save: **bind** = write encrypted registry `credentialId → { alias: pendingAlias, ... }` (alias unchanged).
4. Dual-format continues to share one key and one signing session.
5. Cutover credentials use the **same** fresh-issue path; issuer must not require proof with the previous credential key.

### Presentation (online)

1. Resolve `credentialId` → encrypted registry `alias`.
2. Open action-scoped session with `purpose: 'oid4vp'`; build OID4VP / KB-JWT with ES256.
3. One biometric for that user approve action.

### Presentation (proximity)

1. Resolve alias in JS only to open the session; hand **`opaqueNativeHandle` alone** to proximity module.
2. User approves (biometric as part of session open).
3. Tap-time device auth signatures stay native for the APDU exchange.
4. Close app-level session when the proximity flow ends (hardware window may still briefly remain — residual exposure).

### Lifecycle destroy

`destroyCredentialKey(credentialId)` deletes the mapped Keystore alias and encrypted registry row. Post-cutover renewal (after hardware keys exist) continues to create a **new** pending hardware key for the replacement credential; cutover itself does not sign with the old key.

### Legacy cutover deletion (per credential)

Track cutover state **per credential / per legacy key alias**, not wallet-global:

1. Hardware activation may succeed while some credentials are still Ed25519-bound and not yet replaced.
2. User obtains a **fresh** replacement credential for **C** via issuer reissue (no old-key proof).
3. When **C**’s replacement is successfully issued under hardware P-256 **and** presentation-validated, delete only the legacy Keychain material that bound **C**.
4. Successfully migrating **C** must **not** delete legacy keys still required by credentials **D, E, …**.
5. Wallet-level legacy attest/seed cleanup runs only when no remaining credentials depend on that material.

Until a given credential’s cutover criteria are met, its legacy material may remain at rest for display/history only; it must not be used for holder signing.

### Trust verification

Verification helpers take an **explicit algorithm allowlist** (configurable; default includes `ES256` and `EdDSA` while ecosystem still emits EdDSA). Migrating holder signing to ES256 must not remove EdDSA verification for issuer VCs or verifier JARs.

## Error handling and security gates

| Condition | Behavior |
|-----------|----------|
| `StrongBoxUnavailableException` (or explicit equivalent) **at createKey** | Retry once without StrongBox (TEE create) |
| Any other StrongBox/keygen failure | Fail closed; **no** TEE fallback |
| TEE also unavailable / not hardware-backed **at create** | `HardwareEcdsaUnavailable`; block; no software key |
| `sign()` / session failure on **existing** key | Fail closed; **never** create a replacement key in the sign path |
| Opaque handle purpose/expiry/maxSignatures violated | Native reject; no sign |
| User cancels biometric | `WalletKeySigningCancelled`; session not opened |
| Too many Keystore keys | Typed error; A26 capacity gate covers `ERROR_TOO_MANY_KEYS` (or OEM equivalent) |
| iOS holder signing requested | Fail closed until Secure Enclave slice |
| Cutover path asks for old-key proof | Reject / unsupported — use fresh reissue only |
| Legacy Ed25519 for credential C | No legacy signing; delete C’s legacy material only after C’s validated fresh reissue + present |
| Any caught error | Scoped raw log (`[hardware-ecdsa]`) then friendly UI mapping; no key material, JWTs, or PII |

Production Android posture: wallet crypto is not OPERATIONAL for issuance/presentation if required hardware P-256 cannot be created under the StrongBox→explicit-unavailable-TEE **create** policy.

## Testing and rollout

### CI

- Facade + mock native: create with StrongBox-unavailable → TEE; generic keygen error → no fallback; create with `attestationChallenge` returns chain; JOSE 64-byte `r‖s`; session multi-sign with maxSignatures; delete; authoritative `getSecurityLevel`.
- Registry bind without alias rename; **encrypted** store usage; destroy by mapped alias.
- `did:key` vectors for `[0x80, 0x24]` + 33-byte compressed key.
- COSE_Key fixture for `{1: 2, 3: -7, -1: 1, -2: x, -3: y}`.
- Verify allowlist: ES256 accept; EdDSA accept when allowed; reject outside allowlist.
- Per-credential legacy deletion: migrating C does not delete D’s legacy key.
- Cutover: old-key renewal/presentation path is rejected; fresh reissue path succeeds.
- Proximity: handle-only handoff; native mock rejects mismatched purpose; no JS sign callback during simulated APDU.
- iOS platform gate: issuance/presentation blocked.

### Device gate (blocks production cutover)

On Galaxy A26 (exact production-intent firmware):

1. StrongBox P-256: generate → session sign → verify → native `securityLevel == STRONGBOX`.
2. Explicit StrongBox-unavailable path creates TEE key; generic failure does not.
3. `createKey` with attestation challenge returns a usable certificate chain (when WP requires it).
4. Confirm software private-key path is not used.
5. Action-scoped session: one biometric covers dual-format PoP + nonce retry; measure/observe residual window after `close()`.
6. **Capacity stress:** create N per-credential keys; record `ERROR_TOO_MANY_KEYS` / OEM limit.
7. E2E: attest → dual-format issue → OID4VP present → proximity mdoc with **native** APDU signing via opaque handle only.
8. Fresh-reissue cutover for one legacy credential without old-key signing.
9. Animo spike report: pass/fail against full facade contract (go/no-go).

### Rollout sequence

1. Animo spike on A26 → go/no-go.
2. Implement facade + chosen backend (session + opaque handle bind + encrypted registry + attestation-at-create).
3. Land new ADR; update SECURITY.md, TASKS.md, ADR 0010 notes; document verify allowlist, iOS block, fresh-reissue migration contract with Issuer.
4. Ship Android holder ES256 path; per-credential legacy delete after each validated fresh reissue/present.
5. Remove unused Ed25519 Keychain holder paths after no credentials remain dependent.
6. Separate follow-up: iOS Secure Enclave (unblocks iOS production).

## Documentation deliverables (implementation phase)

- New ADR: hardware P-256 / ES256 production **holder** signing (supersedes ADR 0008 for holder algorithm/storage).
- SECURITY.md Section 1: hardware P-256 / ES256, create-only StrongBox policy, action-scoped session + residual auth window, encrypted registry, verify allowlist, native mdoc signing, attestation-at-create, fresh-reissue migration, iOS blocked.
- TASKS.md session note + backlog updates.
- ADR 0010 related-decision pointer updated (topology unchanged; storage/alg superseded).
- Explicit Issuer migration note: cutover reissue must not require old holder-key proof.

## Alternatives considered

1. **Custom AndroidKeyStore module from day one** — retained as fallback if Animo fails the spike.
2. **Dual-stack EdDSA + ES256 holder signers** — rejected for production; spike window only.
3. **StrongBox-only with no TEE create fallback** — rejected for SKU portability.
4. **Keychain software P-256** — rejected (ADR 0001 / stakeholder hardware requirement).
5. **Strict per-operation CryptoObject (multiple biometrics)** — rejected; one-prompt rule via action-scoped session.
6. **Rename pending alias at bind** — unsupported on Android Keystore; rejected.
7. **TEE fallback on sign failure or generic keygen failure** — rejected (binding break / masks real errors).
8. **iOS “deferred” while still shipping iOS production** — rejected; iOS production explicitly **blocked**.
9. **Unencrypted meta MMKV for registry** — rejected; credential association belongs in encrypted storage.
10. **Wallet-global legacy seed wipe on first successful re-issue** — rejected; must be per credential/alias.
11. **Post-hoc `attestKey(alias, challenge)`** — rejected; Android attestation challenge is a keygen parameter.
12. **Migration-only legacy Ed25519 signing for old-key renewal** — rejected; Issuer supports fresh reissue without old-key proof.

## Open points for implementation plan (not design blockers)

1. Animo spike result → Animo backend vs custom module.
2. Activation flag naming (`wallet.crypto.v2_enabled` vs explicit hardware-P256 marker).
3. Exact `EXPO_PUBLIC_*` name + default seconds for action-scoped / Android auth validity TTL (must be aligned).
4. Default `maxSignatures` per purpose (`oid4vci` dual-format + retries, `oid4vp`, `mdoc`).
5. Wallet Provider contract: whether `attestationChallenge` is required on first production `k_attest` create or public-JWK-only interim.
6. Verify allowlist configuration source (env vs trusted-verifier/issuer metadata).
7. Concrete encrypted-MMKV key namespace for the credential-key registry (follow existing credential encryption patterns).
8. Issuer UX/API details for fresh reissue entry points (portal vs offer) — must match “no old-key proof.”

## Success criteria

- A26 StrongBox P-256 evidence recorded; explicit-StrongBox-unavailable TEE create proven; capacity stress recorded.
- Action-scoped session: one biometric for dual-format + nonce retry; residual auth window documented and TTL-aligned.
- New Android issuance, online presentation, and proximity device auth succeed with hardware aliases; APDU signing stays native via opaque handle only.
- Attestation chain available from `createKey` when challenged; no post-hoc attest API.
- Verification still accepts allowlisted EdDSA issuer/JAR signatures where configured.
- Registry lives in encrypted MMKV; no production software private keys for holder signing.
- Cutover uses fresh reissue without old-key signing; legacy Ed25519 deletion is per credential/alias after validated cutover.
- iOS production issuance/presentation blocked until Secure Enclave follow-up.
- Docs/ADR/SECURITY reflect supersession of ADR 0008 for holder signing.
