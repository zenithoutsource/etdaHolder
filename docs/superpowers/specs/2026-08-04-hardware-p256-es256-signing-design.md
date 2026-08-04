# Hardware P-256 / ES256 Production Signing

> **Date:** 2026-08-04  
> **Status:** Approved for implementation planning (revised after independent grill review)  
> **Supersedes (when implemented):** ADR 0008 (Keychain-protected software Ed25519) as the production **holder** signing algorithm and storage model  
> **Updates:** ADR 0001 (hardware non-extractable restored for protocol holder keys); ADR 0010 (topology kept; algorithm/storage becomes hardware P-256)  
> **Related:** Stakeholder decision that EdDSA is no longer required for holder keys; Issuer/Verifier accept ES256 for holder proofs; target device Samsung Galaxy A26  
> **Review input:** Independent grill of this spec ([spec review chat](7c08c567-c485-43b0-b406-8e4ef816d18f)); biometric policy locked to action-scoped session (option A)

## Summary

Replace production **holder** signing (**EdDSA / Ed25519** Keychain software seeds per ADR 0008 / 0010) with **hardware non-extractable P-256** keys and wire algorithm **`alg: ES256`**.

- **Curve / key:** P-256 (`secp256r1`)
- **JWT alg (holder):** ES256 (ECDSA with P-256 and SHA-256)
- **Storage:** AndroidKeyStore; **StrongBox-first at key creation**, TEE only if StrongBox unavailable at creation; **no software private keys**
- **Topology:** Keep ADR 0010 — `k_attest` + one `k_cred` per credential. **Bind does not rename Keystore aliases** (registry maps `credentialId → existing alias`).
- **Biometric:** One prompt per user action via a short **native action-scoped signing session** (multiple ES256 signs / nonce retries inside that session).
- **Verify path:** Algorithm **allowlist** — holder migration to ES256 must **not** strip EdDSA verification for issuer credentials or verifier JARs that still use EdDSA.
- **Proximity:** ISO 18013-5 / mdoc device auth must sign through the credential’s hardware alias (no raw seed handoff).
- **Platform:** Android (Galaxy A26) first; iOS Secure Enclave deferred
- **Migration:** Hard cutover for new holder keys; legacy Ed25519 Keychain material deleted only **after** successful re-issue and presentation validation
- **Native stack:** Evaluate `@animo-id/expo-secure-environment` first as a **go/no-go** against StrongBox selection, security-level reporting, delete, and action-scoped sessions; own AndroidKeyStore module if Animo cannot meet the contract

## Problem

ADR 0007/0008 adopted Ed25519 because the customer required `alg: EdDSA` for holder proofs. Target Android devices could not provide hardware-backed Ed25519 through AndroidKeyStore, so production fell back to Keychain-protected **software** seeds. That satisfies protocol EdDSA but violates the preferred ADR 0001 hardware non-extractable model.

The stakeholder now accepts **P-256 / ES256 for holder signing** (and related wallet-emitted proofs). Android StrongBox’s documented baseline includes P-256, so the wallet can return to hardware-backed holder signing without keeping an EdDSA **software holder** path. Issuer/Verifier **signature verification** remains multi-alg until the ecosystem fully drops EdDSA on those surfaces.

## Goals

1. Protocol holder keys (`k_attest`, each `k_cred`) are generated and used in hardware; JS never receives private key bytes.
2. Prefer StrongBox at **key creation**; allow TEE only when StrongBox is absent/unavailable at creation; fail closed otherwise. Never create a different key on sign failure.
3. Emit holder proofs with **`alg: ES256`** (OID4VCI PoP, OID4VP / SD-JWT KB-JWT, wallet attestation signing, mdoc device auth).
4. Preserve ADR 0010 lifecycle with alias-stable bind; destroy on renewal/revoke/delete; **one biometric prompt per user action** via action-scoped signing session.
5. Preserve dual-format issuance: one pending key and one proof-signing **session** for `dc+sd-jwt` + `mso_mdoc` (and fresh-nonce retries inside that session).
6. Keep trust/credential **verification** on an explicit algorithm allowlist (ES256 required for new holder material; EdDSA retained while issuers/verifiers still produce it).
7. Gate production cutover on Galaxy A26 physical evidence (StrongBox P-256, TEE fallback at create, capacity stress, E2E issue/present/proximity).
8. Document the decision in a new ADR and update SECURITY.md / TASKS.md / ADR 0010 algorithm notes.

## Non-goals

- Keeping a production EdDSA / Ed25519 **holder signer** after cutover.
- Software P-256 (or any software private key) as a production fallback.
- Soft dual-alg **holder** migration (present old Ed25519-bound credentials indefinitely alongside new ES256 holder keys).
- Forcing all issuer/verifier JWTs to ES256 in the same slice (verification allowlist handles coexistence).
- iOS Secure Enclave implementation in this slice (follow-up ADR).
- Changing OID4VCI client boundary (still on-device Sphereon), card UI config model, or company API SDK path.
- Requiring StrongBox on every SKU with no TEE fallback at creation.
- Treating cached MMKV `securityLevel` as authoritative proof of hardware backing.

## Terminology

| Term | Meaning |
|------|---------|
| **P-256** | Elliptic curve (`secp256r1` / `prime256v1`) for the key |
| **ES256** | JWA/JWT algorithm: ECDSA using P-256 and SHA-256 (`"alg": "ES256"`); JWS signature is **64-byte `r‖s`** (IEEE P1363 / JOSE) |
| **StrongBox** | Android Keystore security level `STRONGBOX` |
| **TEE** | Android Keystore security level `TRUSTED_ENVIRONMENT` |
| **Action-scoped signing session** | Native session opened for one user action: one biometric unlock, then multiple hardware signs for that action until close/expiry |

## Decision drivers (locked)

| Topic | Decision |
|-------|----------|
| Holder signing | Hardware P-256 / `alg: ES256` everywhere the wallet signs |
| Trust / issuer verification | Explicit alg allowlist; do **not** remove EdDSA verify solely because holder moved to ES256 |
| Private keys | Hardware only; StrongBox-first **at create**; TEE fallback **at create only**; never software |
| Biometric vs CryptoObject | **One prompt wins** — native action-scoped session supports multi-sign + nonce retry |
| Migration | Hard cutover for holder keys; legacy seed delete **after** validated re-issue/present |
| Key topology | Keep ADR 0010; bind = registry map only (no Keystore rename) |
| Native stack | Animo spike is go/no-go; custom module if contract unmet |
| Platform priority | Android Galaxy A26 first |
| Ecosystem (holder proofs) | Issuer/Verifier already accept ES256 holder proofs |

## Architecture

### Approach

**Hardware signer facade + Animo spike → production cutover** (Approach 1).

1. Introduce TypeScript `HardwareEcdsaSigner` as the only protocol private-key API.
2. Spike Animo on A26 against the full contract below (StrongBox selection, `KeyInfo` security level, delete, action-scoped session, JOSE `r‖s`). Public Animo docs today cover P-256 + biometrics but **not** StrongBox selection, security-level reporting, deletion, or action-scoped sessions — spike outcome decides backend.
3. If Animo cannot satisfy the contract, implement a local Expo Android module wrapping AndroidKeyStore P-256 with the same facade.
4. Rewire `walletAttestKey`, `credentialSigningKey`, `crypto.ts`, and mdoc device-auth bridge to the facade.
5. After A26 E2E + capacity gates pass: hard cutover of holder signing; new ADR supersedes ADR 0008 for production **holder** signing.

### Layers

```text
OID4VCI / OID4VP / Attest / mdoc device auth
        ↓
crypto.ts + credentialSigningKey + walletAttestKey + proximity bridge
        ↓
HardwareEcdsaSigner (TS facade)
        ↓
Animo secure-environment  OR  own AndroidKeyStore module
        ↓
AndroidKeyStore P-256 (StrongBox → TEE at create only → fail closed)

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

interface HardwareEcdsaSigner {
  /** StrongBox-first; on StrongBox failure retry once without StrongBox (TEE). Never software. */
  createKey(alias: string): Promise<{ publicJwk: EcP256Jwk; securityLevel: HardwareSecurityLevel }>

  getPublicJwk(alias: string): Promise<EcP256Jwk>

  /** Authoritative: read KeyInfo (or equivalent) from native; do not trust MMKV cache alone. */
  getSecurityLevel(alias: string): Promise<HardwareSecurityLevel>

  /**
   * Open one user-action session: single biometric prompt, then multiple sign() calls
   * for dual-format PoP and fresh-nonce retries until close or TTL expiry.
   * TTL must be env-configurable (EXPO_PUBLIC_* with documented default).
   */
  openSigningSession(alias: string): Promise<HardwareSigningSession>

  deleteKey(alias: string): Promise<void>

  /**
   * Optional remote hardware attestation for Wallet Provider.
   * Required in production if WP policy demands Android key attestation;
   * otherwise may return unsupported and WP uses public JWK only (document WP contract).
   */
  attestKey?(alias: string, challenge: Uint8Array): Promise<{ certificateChainDer: Uint8Array[] }>
}

interface HardwareSigningSession {
  /** Returns JOSE ES256 signature: exactly 64-byte r‖s (P1363). Not DER. */
  sign(data: Uint8Array): Promise<Uint8Array>
  close(): Promise<void>
}
```

**Sign-failure rule:** If `sign()` fails for an existing alias, **fail closed**. Do **not** create a replacement TEE/StrongBox key during sign — that would change the holder public key / DID and break credential binding.

### Key aliases and registry

Android Keystore aliases are **immutable** after creation. “Bind” never renames.

| Key | Alias lifecycle | Used for | Destroyed |
|-----|-----------------|----------|-----------|
| `k_attest` | Stable alias e.g. `wallet.p256.attest` | WUA/WIA (+ optional key attestation) | Wallet reset / reinstall |
| `k_cred` | Random pending alias at create, e.g. `wallet.p256.cred.pending.{uuid}` | Issuance PoP before/after `credentialId` exists | Timeout GC, failure cleanup, or lifecycle destroy |
| Bind | **No rename** — registry row `credentialId → { alias: <pending alias>, ... }` | Lookup for presentation / renew / destroy | — |

MMKV registry (hint metadata only; **not** authoritative for hardware properties):

```text
credentialId → {
  holderDid,
  alias,              // exact Keystore alias created at pending time
  credentialType,
  createdAt,
  securityLevelHint   // cached at create for UX/diagnostics only
}
```

Call sites that need assurance must call `getSecurityLevel(alias)` (native `KeyInfo`). Do not gate security-critical decisions on `securityLevelHint` alone.

### Identity shapes

- **Public JWK:** `{ "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }`
- **Holder `did:key`:** P-256 multicodec form derived from the public key (not Ed25519 `[0xed, 0x01]`)
- **JWT / KB-JWT headers:** `alg: ES256`; signature bytes are JOSE **64-byte `r‖s`**
- Exact P-256 `did:key` helper + test vectors land in the implementation plan

### Proximity / mdoc

Current ISO 18013-5 path that accepts a raw Ed25519 seed must be replaced: install/use the credential’s **hardware alias** and perform device auth signatures through `HardwareEcdsaSigner` / session. No private key bytes cross the JS↔native boundary for signing.

### `k_attest` and remote attestation

- Local hardware generation + ES256 signing for WUA/WIA payloads is in scope.
- If Wallet Provider policy requires proof of hardware backing, use `attestKey(alias, challenge)` and return the Android attestation certificate chain.
- If WP currently only consumes the public JWK, that interim contract must be written explicitly; the facade still exposes `attestKey` so production can enable remote attestation without another redesign.

## Data flow

### Activation

1. Create hardware `k_attest` (StrongBox-first at create).
2. Persist public metadata + `securityLevelHint`; revalidate via native when needed.
3. Complete WUA/WIA (and optional `attestKey` challenge) with Wallet Provider.
4. Set operational/activation gate only after attest succeeds.
5. **Do not** delete legacy Ed25519 Keychain seeds yet — mark wallet as requiring credential re-issue; refuse to use legacy seeds for **new** protocol ops.

### Issuance

1. `createPendingCredentialKey()` → `createKey(randomPendingAlias)`.
2. `openSigningSession(alias)` → one biometric → sign dual-format PoPs / nonce retries with `alg: ES256` → `close()`.
3. On successful save: **bind** = write registry `credentialId → { alias: pendingAlias, ... }` (alias unchanged).
4. Dual-format continues to share one key and one signing session.

### Presentation (online + proximity)

1. Resolve `credentialId` → registry `alias`.
2. Open action-scoped session on that alias; build OID4VP / KB-JWT and/or mdoc device auth with ES256 / hardware sign.
3. One biometric for that user approve action.

### Lifecycle destroy

`destroyCredentialKey(credentialId)` deletes the Keystore alias from the registry mapping and removes the registry row. Renewal creates a **new** pending hardware key (new alias); never rebinds Ed25519 material.

### Legacy cutover deletion

Delete Keychain Ed25519 seeds only after:

1. Hardware activation succeeded, and  
2. Replacement credential(s) have been successfully issued **and** presentation-validated (online and/or proximity per release checklist).

Until then, legacy material may remain at rest but must not be used for new holder signing.

### Trust verification

Verification helpers take an **explicit algorithm allowlist** (configurable; default includes `ES256` and `EdDSA` while ecosystem still emits EdDSA). Migrating holder signing to ES256 must not remove EdDSA verification for issuer VCs or verifier JARs. Wrong-alg still rejected when not on the allowlist.

## Error handling and security gates

| Condition | Behavior |
|-----------|----------|
| StrongBox unavailable **at createKey** | Retry once without StrongBox (TEE create) |
| TEE also unavailable / not hardware-backed **at create** | `HardwareEcdsaUnavailable`; block; no software key |
| `sign()` / session failure on **existing** key | Fail closed; **never** create a replacement key in the sign path |
| User cancels biometric | `WalletKeySigningCancelled`; session not opened; no second app-level biometric for same action |
| Too many Keystore keys | Surface typed error; A26 capacity gate must cover `ERROR_TOO_MANY_KEYS` (or OEM equivalent) |
| Legacy Ed25519 present | Block new Ed25519 signing; require re-issue; delete seeds only after validated cutover |
| Any caught error | Scoped raw log (`[hardware-ecdsa]`) then friendly UI mapping; no key material, JWTs, or PII |

Production Android posture: wallet crypto is not OPERATIONAL for issuance/presentation if required hardware P-256 cannot be created under the StrongBox→TEE **create** policy.

## Testing and rollout

### CI

- Facade + mock native: create (StrongBox then TEE fallback simulation), JOSE 64-byte `r‖s` ES256 sign, session multi-sign, delete, authoritative `getSecurityLevel`.
- Registry bind **without** alias rename; destroy by mapped alias.
- PoP / KB-JWT fixtures: `alg: ES256`, P-256 JWK/`did:key`.
- Verify allowlist: ES256 accept; EdDSA accept when allowed; reject algs outside allowlist.
- Cutover: legacy seeds unused for signing; deletion gated on validated re-issue/present flags.
- mdoc bridge unit tests: signs via alias/session mock, never accepts raw seed in production path.

### Device gate (blocks production cutover)

On Galaxy A26 (exact production-intent firmware):

1. StrongBox P-256: generate → session sign → verify → native `securityLevel == STRONGBOX`.
2. TEE create fallback when StrongBox unavailable/forced off; still hardware-backed.
3. Confirm software private-key path is not used.
4. Action-scoped session: one biometric covers dual-format PoP + at least one nonce retry.
5. **Capacity stress:** create N per-credential keys toward realistic wallet cardinality; record behavior at `ERROR_TOO_MANY_KEYS` / OEM limit.
6. E2E: attest → dual-format issue → OID4VP present → proximity mdoc device auth with hardware alias.
7. Animo spike report: pass/fail against full facade contract (go/no-go for custom module).

### Rollout sequence

1. Animo spike on A26 → go/no-go.
2. Implement facade + chosen backend (session API required).
3. Land new ADR; update SECURITY.md, TASKS.md, ADR 0010 algorithm/storage notes; document verify allowlist.
4. Ship holder ES256 path; keep legacy seeds until validated re-issue/present, then delete.
5. Remove Ed25519 Keychain **holder** production path after cutover criteria met.
6. Schedule iOS Secure Enclave follow-up separately.

## Documentation deliverables (implementation phase)

- New ADR: hardware P-256 / ES256 production **holder** signing (supersedes ADR 0008 for holder algorithm/storage).
- SECURITY.md Section 1: hardware P-256 / ES256, StrongBox→TEE **at create**, action-scoped session, verify allowlist, mdoc alias signing.
- TASKS.md session note + backlog updates.
- ADR 0010 related-decision pointer updated (topology unchanged; storage/alg superseded).

## Alternatives considered

1. **Custom AndroidKeyStore module from day one** — retained as fallback if Animo fails the spike.
2. **Dual-stack EdDSA + ES256 holder signers** — rejected for production; spike window only.
3. **StrongBox-only with no TEE create fallback** — rejected for SKU portability.
4. **Keychain software P-256** — rejected (ADR 0001 / stakeholder hardware requirement).
5. **Strict per-operation CryptoObject (multiple biometrics)** — rejected; one-prompt rule takes precedence via action-scoped session.
6. **Rename pending alias to `cred.{credentialId}` at bind** — impossible/unsupported on Android Keystore; rejected in favor of registry mapping.
7. **TEE fallback on sign failure** — rejected; would change holder key material and break bindings.

## Open points for implementation plan (not design blockers)

1. Exact P-256 `did:key` multicodec helper and test vectors.
2. Animo spike result → Animo backend vs custom module.
3. Activation flag naming (`wallet.crypto.v2_enabled` vs explicit hardware-P256 marker).
4. Action-scoped session TTL default and `EXPO_PUBLIC_*` name.
5. Wallet Provider contract: whether `attestKey` certificate chain is required in the first production WP API or public-JWK-only interim.
6. Verify allowlist configuration source (env vs trusted-verifier/issuer metadata).

## Success criteria

- A26 StrongBox P-256 evidence recorded; TEE **create** fallback proven; capacity stress recorded.
- Action-scoped session: one biometric for dual-format + nonce retry on device.
- New issuance, online presentation, and proximity device auth succeed with hardware aliases and ES256 holder proofs.
- Verification still accepts allowlisted EdDSA issuer/JAR signatures where configured.
- No production path exports or uses software private keys for holder signing.
- Legacy Ed25519 seeds removed only after validated re-issue/present.
- Docs/ADR/SECURITY reflect supersession of ADR 0008 for holder signing.
