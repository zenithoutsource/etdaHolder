# Hardware P-256 / ES256 Production Signing

> **Date:** 2026-08-04  
> **Status:** Approved for implementation planning  
> **Supersedes (when implemented):** ADR 0008 (Keychain-protected software Ed25519) as the production signing algorithm and storage model  
> **Updates:** ADR 0001 (hardware non-extractable restored for protocol keys); ADR 0010 (topology kept; algorithm/storage becomes hardware P-256)  
> **Related:** Stakeholder decision that EdDSA is no longer required; Issuer/Verifier already accept ES256; target device Samsung Galaxy A26

## Summary

Replace production **EdDSA / Ed25519** (Keychain-protected software seeds per ADR 0008 / 0010) with **hardware non-extractable P-256** keys and wire algorithm **`alg: ES256`**.

- **Curve / key:** P-256 (`secp256r1`)
- **JWT alg:** ES256 (ECDSA with P-256 and SHA-256)
- **Storage:** AndroidKeyStore; **StrongBox-first**, TEE (`TRUSTED_ENVIRONMENT`) only if StrongBox unavailable; **no software private keys**
- **Topology:** Keep ADR 0010 — `k_attest` + one `k_cred` per credential (pending → bind → destroy)
- **Platform:** Android (Galaxy A26) first; iOS Secure Enclave deferred
- **Migration:** Hard cutover — re-activate wallet, re-issue all credentials; delete Ed25519 Keychain production path after cutover
- **Native stack:** Evaluate `@animo-id/expo-secure-environment` first; own AndroidKeyStore Expo module only if Animo cannot meet StrongBox-first, per-alias, and biometric CryptoObject requirements

## Problem

ADR 0007/0008 adopted Ed25519 because the customer required `alg: EdDSA`. Target Android devices could not provide hardware-backed Ed25519 through AndroidKeyStore, so production fell back to Keychain-protected **software** seeds. That satisfies protocol EdDSA but violates the preferred ADR 0001 hardware non-extractable model.

The stakeholder now accepts **P-256 / ES256 on the full protocol surface**. Android StrongBox’s documented baseline includes P-256, so the wallet can return to hardware-backed signing without keeping an EdDSA software path.

## Goals

1. Protocol keys (`k_attest`, each `k_cred`) are generated and used in hardware; JS never receives private key bytes.
2. Prefer StrongBox; allow TEE only when StrongBox is absent/unavailable; fail closed otherwise.
3. Emit and verify **`alg: ES256`** for OID4VCI PoP, OID4VP / SD-JWT KB-JWT, wallet attestation, and trust/JAR verification paths that the wallet signs or verifies.
4. Preserve ADR 0010 lifecycle: pending credential key, bind after save, destroy on renewal/revoke/delete; one biometric prompt per user action (sign-time hardware gate only).
5. Preserve dual-format issuance rule: one pending key and one proof-signing session for `dc+sd-jwt` + `mso_mdoc`.
6. Gate production cutover on Galaxy A26 physical evidence (StrongBox P-256 + TEE fallback + E2E issue/present).
7. Document the decision in a new ADR and update SECURITY.md / TASKS.md / ADR 0010 algorithm notes.

## Non-goals

- Keeping a production EdDSA / Ed25519 signer after cutover.
- Software P-256 (or any software private key) as a production fallback.
- Soft dual-alg migration (present old Ed25519 credentials indefinitely alongside new ES256).
- iOS Secure Enclave implementation in this slice (follow-up ADR).
- Changing OID4VCI client boundary (still on-device Sphereon), card UI config model, or company API SDK path.
- Requiring StrongBox on every SKU with no TEE fallback (TEE is allowed when StrongBox cannot be used).

## Terminology

| Term | Meaning |
|------|---------|
| **P-256** | Elliptic curve (`secp256r1` / `prime256v1`) for the key |
| **ES256** | JWA/JWT algorithm: ECDSA using P-256 and SHA-256 (`"alg": "ES256"`) |
| **StrongBox** | Android Keystore security level `STRONGBOX` (dedicated secure hardware where available) |
| **TEE** | Android Keystore security level `TRUSTED_ENVIRONMENT` |

## Decision drivers (locked in brainstorming)

| Topic | Decision |
|-------|----------|
| Scope | Full surface: holder signing, `k_attest`, trust/verification material → ES256 / P-256 |
| Private keys | Hardware only; StrongBox-first; TEE fallback; never software |
| Migration | Hard cutover / re-issue (recommended; approved) |
| Key topology | Keep ADR 0010 (`k_attest` + per-credential `k_cred`) |
| Native stack | Animo first; custom AndroidKeyStore module if Animo insufficient |
| Platform priority | Android Galaxy A26 first |
| Ecosystem | Issuer/Verifier already accept ES256 |

## Architecture

### Approach

**Hardware signer facade + Animo spike → production cutover** (Approach 1).

1. Introduce a TypeScript `HardwareEcdsaSigner` facade as the only protocol private-key API.
2. Spike Animo on A26 against StrongBox-first, alias-per-key, biometric CryptoObject, and delete/lifecycle needs.
3. If Animo cannot satisfy the policy, implement a local Expo Android module wrapping AndroidKeyStore P-256 with the same facade contract.
4. Rewire `walletAttestKey`, `credentialSigningKey`, and `crypto.ts` to the facade; emit P-256 `did:key` + EC JWK; JWT `alg: ES256`.
5. After A26 E2E gate passes: hard cutover — remove Keychain Ed25519 production path; new ADR supersedes ADR 0008 for production signing.

### Layers

```text
OID4VCI / OID4VP / Attest / Trust verify
        ↓
crypto.ts + credentialSigningKey + walletAttestKey
        ↓
HardwareEcdsaSigner (TS facade)
        ↓
Animo secure-environment  OR  own AndroidKeyStore module
        ↓
AndroidKeyStore P-256 (StrongBox → TEE → fail closed)
```

### Facade contract

```ts
type HardwareSecurityLevel = 'STRONGBOX' | 'TEE'

interface HardwareEcdsaSigner {
  createKey(alias: string): Promise<{ publicJwk: EcP256Jwk; securityLevel: HardwareSecurityLevel }>
  getPublicJwk(alias: string): Promise<EcP256Jwk>
  sign(alias: string, data: Uint8Array): Promise<Uint8Array> // raw ECDSA or DER — pick one in plan and normalize for JWS
  deleteKey(alias: string): Promise<void>
  getSecurityLevel(alias: string): Promise<HardwareSecurityLevel>
}
```

Implementation plan must fix one signature encoding for JWS ES256 (typically IEEE P1363 r‖s) and test round-trip with Issuer/Verifier.

### Key aliases and registry

| Key | Alias (illustrative) | Used for | Destroyed |
|-----|----------------------|----------|-----------|
| `k_attest` | `wallet.p256.attest` | WUA/WIA | Wallet reset / reinstall |
| `k_cred` pending | `wallet.p256.cred.pending.{id}` | Issuance PoP before `credentialId` exists | Bind, timeout GC, or failure cleanup |
| `k_cred` | `wallet.p256.cred.{credentialId}` | PoP (retries), KB-JWT, OID4VP for that VC | P3 old key; P6 revoke/used/cancel; user delete |

MMKV registry (no private key bytes):

```text
credentialId → {
  holderDid,
  alias,
  credentialType,
  createdAt,
  securityLevel   // 'STRONGBOX' | 'TEE'
}
```

Attest metadata may also record `k_attest` security level. Cached WUA/WIA blobs remain non-secret protocol artifacts as today.

### Identity shapes

- **Public JWK:** `{ "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }`
- **Holder `did:key`:** P-256 multicodec form derived from the public key (not Ed25519 `[0xed, 0x01]`)
- **JWT / KB-JWT headers:** `alg: ES256` (plus existing `kid` / `jwk` binding rules per format)

Exact `did:key` multicodec encoding helper replaces the Ed25519-only helpers in crypto/VP diagnostics.

## Data flow

### Activation

1. Create hardware `k_attest` (StrongBox-first).
2. Persist public metadata + security level.
3. Complete WUA/WIA with Wallet Provider using P-256 material.
4. Set operational/activation gate only after attest succeeds.
5. Best-effort delete any legacy Ed25519 Keychain seeds; refuse to use them for new protocol ops.

### Issuance

1. `createPendingCredentialKey()` → hardware pending alias.
2. Sign PoP with `alg: ES256` (one biometric via hardware sign gate).
3. On successful save: bind pending → credential alias; update registry.
4. Dual-format: reuse one pending key and one proof session across both formats (current v2 behavior).

### Presentation

1. Resolve credential → registry alias.
2. Build presentation / KB-JWT with that key, `alg: ES256`.
3. One biometric per user approve action.

### Lifecycle destroy

`destroyCredentialKey(credentialId)` deletes the Keystore alias and registry row. Renewal always creates a new hardware key; no rebinding of Ed25519 material.

### Trust verification

JAR and pinned verifier/issuer keys verified with ES256 / P-256 JWKs per allowlist and resolution rules. EdDSA-only verify helpers are retired or restricted to non-production fixtures after cutover.

## Error handling and security gates

| Condition | Behavior |
|-----------|----------|
| StrongBox keygen/sign unavailable | Retry once without StrongBox (TEE path) |
| TEE also unavailable / not hardware-backed | `HardwareEcdsaUnavailable`; block issue/present; no software key creation |
| User cancels biometric | Existing `WalletKeySigningCancelled`; no extra app-level biometric for the same action |
| Legacy Ed25519 material present | Force re-activation / re-issue path; do not sign with old seeds |
| Any caught error | Scoped raw log (`[hardware-ecdsa]`) then friendly UI mapping; no key material, JWTs, or PII in logs |

Production Android posture: wallet crypto is not OPERATIONAL for issuance/presentation if required hardware P-256 cannot be established under the StrongBox→TEE policy.

## Testing and rollout

### CI

- Facade tests with mock native backend (create / publicJwk / ES256 sign / delete / securityLevel).
- Pending → bind → destroy registry tests (alias-based, no Keychain seeds).
- PoP and KB-JWT fixture updates: `alg: ES256`, P-256 JWK/`did:key`.
- ES256 verify happy path + wrong-`alg` reject.
- Cutover detector tests for legacy Ed25519 material.

### Device gate (blocks production cutover)

On Galaxy A26 (exact production-intent firmware):

1. StrongBox P-256: generate → sign → verify → `KeyInfo.securityLevel == STRONGBOX`.
2. TEE fallback probe (StrongBox not requested or unavailable) still reports hardware-backed TEE.
3. Confirm software private-key path is not used.
4. E2E: attest → dual-format issue → OID4VP present; one biometric per user action.

### Rollout sequence

1. Animo spike on A26 → go/no-go for custom module.
2. Implement facade + chosen backend; keep EdDSA code only for the spike window (not a dual production mode).
3. Land new ADR; update SECURITY.md, TASKS.md, ADR 0010 algorithm/storage notes.
4. Hard cutover: remove Ed25519 Keychain production signing path.
5. Schedule iOS Secure Enclave follow-up separately.

## Documentation deliverables (implementation phase)

- New ADR: hardware P-256 / ES256 production signing (supersedes ADR 0008 for production algorithm/storage).
- SECURITY.md Section 1 rewritten for hardware P-256 / ES256 and StrongBox→TEE policy.
- TASKS.md session note + backlog updates.
- ADR 0010 “Related decisions” / algorithm baseline updated to point at the new ADR (topology unchanged).

## Alternatives considered

1. **Custom AndroidKeyStore module from day one** — full StrongBox control, higher upfront cost; retained as fallback if Animo fails the spike.
2. **Dual-stack EdDSA + ES256** — safer rollback, rejected: two signers/DID shapes, conflicts with full replacement and no-software policy once hardware path exists.
3. **StrongBox-only with no TEE fallback** — strongest single bar, rejected for SKU portability; TEE remains hardware non-extractable when StrongBox is missing.
4. **Keychain software P-256** — smallest code delta, rejected: stakeholder and ADR 0001 require hardware, not another software seed.

## Open points for implementation plan (not design blockers)

1. Exact JWS signature byte encoding (P1363 vs DER) and normalization helper.
2. Exact P-256 `did:key` multicodec helper and test vectors.
3. Animo API surface vs required alias/StrongBox/biometric controls (spike result decides backend).
4. Whether activation flag remains `wallet.crypto.v2_enabled` or a new explicit hardware-P256 marker — plan should pick one naming scheme and migrate cleanly.

## Success criteria

- A26 StrongBox P-256 evidence recorded; TEE fallback path proven.
- New issuance and presentation succeed against current ES256-capable Issuer/Verifier.
- No production path reads an Ed25519 seed from Keychain for protocol signing.
- Registry and destroy paths operate on hardware aliases.
- Docs/ADR/SECURITY reflect the supersession of ADR 0008 for production signing.
