# Defer First-Install Keychain Biometric Design

**Date:** 2026-08-07  
**Status:** Approved for implementation planning  
**Scope:** Remove the blank first-install Keychain fingerprint prompt ("Authenticate to retrieve secret") by deferring biometric-bound seed creation until the first claim/sign action, with exactly one biometric prompt for that action.

## Context

On a fresh install, cold start currently calls `generateWalletKeyIfNeeded()` and often `activateWalletCryptoV2()` → `ensureWalletAttestKey()` from `app/_layout.tsx` `prepareWallet`. Those paths write Ed25519 seeds to `react-native-keychain` with `BIOMETRY_ANY_OR_DEVICE_PASSCODE` + `AES_GCM`. On Android, binding a secret to biometrics commonly prompts fingerprint at **write** time. The write path does not set `authenticationPrompt`, so the OS/library default English string `"Authenticate to retrieve secret"` appears even though the wallet is empty.

This is intentional Keychain policy under ADR 0008 / ADR 0010, but the **timing** is poor UX: the Holder has not yet performed a key-needing action.

Storage unlock is a separate path (`initStorage` / Android `AES_GCM_NO_AUTH` + app-level gate when a session exists) and is **out of scope**.

## Goals

1. Blank first install / cold start with no keys: **no** fingerprint for Keychain secret create or retrieve.
2. First claim (or first presentation that must create/first-retrieve a biometric-bound key): **exactly one** biometric prompt for the whole user action.
3. Keep biometric-bound Keychain protection for **credential** signing seeds (ADR 0008 / 0010).
4. Explicit prompt titles (Thai / product copy) — never rely on the default retrieve-secret string.
5. Later claim/sign actions keep the existing one prompt per action (sign-time Keychain get).

## Non-goals

- Changing Wallet PIN / storage unlock / PIN-fallback startup UX.
- Hardware AndroidKeyStore Ed25519 (still blocked per ADR 0008 / hardware validation work).
- Removing biometric access control from per-credential signing seeds.
- Reworking modality (fingerprint vs face) — covered by the existing biometric-gate consolidation work.
- Full push multi-DID server redesign (only pin which DID is used after deferral).

## Decision

**Approach: defer create + short-lived first-use issuance session.**

Cold start never performs Keychain get/set for wallet seed, `k_attest`, or credential seeds. The first key-needing claim opens a first-use issuance session that performs one biometric gate, provisions keys, activates v2, signs PoP, and binds — all from in-memory seeds after that gate.

Rejected alternatives:

| Alternative | Why rejected |
|---|---|
| Create seeds without biometric binding (`AES_GCM_NO_AUTH`), gate only on read | Weakens at-rest protection for credential signing seeds vs ADR 0008 |
| Keep eager create; only polish prompt copy | Fails the no-blank-install-scan goal |

## Architecture

### Cold start (`prepareWallet`)

Hard rules (no exceptions for "retry activation"):

1. Keep device integrity, runtime policy, and storage init as today.
2. **Never** call `generateWalletKeyIfNeeded()` on cold start for a greenfield / empty-key wallet.
3. **Never** call `activateWalletCryptoV2()` or `ensureWalletAttestKey()` on cold start — including when `k_attest` already exists but `wallet.crypto.v2_enabled` is still false (failed prior attest). Activation is only from a user claim/present action.
4. **Never** call `getHolderDid()` / push registration on cold start when no push identity has been established yet.
5. App reaches ready/empty-wallet UI without Keychain biometric create or retrieve prompts.

Legacy single-key wallets (`detectLegacySingleKeyWallet`) remain an error path as today; this design does not revive wallet-level seed creation for v2.

### First-use issuance session (required API)

Chained helpers today cannot meet the one-prompt rule:

- `createPendingCredentialKey` writes then wipes the seed
- `createCredentialKeySigningSession` / `createProofSigningSession` re-reads Keychain (second prompt)
- `bindPendingKeyToCredential` reads pending then writes the bound service (more Keychain auth)
- `ensureWalletAttestKey` may also prompt on write/get

Therefore first claim must use a **new** session API (name illustrative) in `src/services/crypto/`:

```ts
withFirstUseIssuanceSession<T>(
  run: (session: FirstUseIssuanceSession) => Promise<T>,
): Promise<T>

type FirstUseIssuanceSession = {
  pendingCredentialKeyId: string
  /** Proof session that signs from the in-memory pending seed (no Keychain get). */
  proofSession: ProofSigningSession
  /** Activates WUA/WIA and sets wallet.crypto.v2_enabled using in-memory attest public JWK. */
  activateV2: () => Promise<void>
}
```

**Session mechanics (pinned):**

1. Generate `k_attest` seed and pending `k_cred` seed in memory.
2. Perform **exactly one** biometric-gated Keychain operation for the credential pending seed: `setGenericPassword` with `BIOMETRY_ANY_OR_DEVICE_PASSCODE` + `AES_GCM` and an explicit `authenticationPrompt` (Thai/product copy). This is the only user-visible biometric for the action.
3. Persist `k_attest` with device-bound Keychain options that **do not** trigger a second biometric prompt at write time (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, no `BIOMETRY_*` access control on that write). Rationale: claim-time attest activation needs only the public JWK (already in memory); `k_attest` private material is not used for VC PoP. If a later product action must use the attest private key, that later action’s Keychain get is its own one-prompt gate (or the key is re-bound under biometric policy in a dedicated follow-up — out of scope here).
4. Write pending-key metadata; keep both seeds in the session object.
5. Expose `proofSession.signProof` / `bindCredentialKey` that use the **in-memory** pending seed (extend the existing `bindPendingKeyWithSeed` path already used by `createCredentialKeySigningSession`). Bind’s Keychain write of the bound credential service must also avoid a second biometric prompt: write the bound service using the same in-memory seed **without** a second interactive auth — prefer writing the bound entry with biometric access control only if the platform will not re-prompt after the session’s initial auth; otherwise write bound entry device-bound and rely on the next present/claim Keychain get as the biometric gate for that later action. **Implementation acceptance test:** instrumented/device run must show one BiometricPrompt for the full first claim including bind.
6. `close` / `finally`: wipe in-memory seeds even on failure.

When v2 is already enabled and a pending/bound credential key already exists, do **not** use this first-use session — use today’s `createProofSigningSession(credentialKeyId)` (one sign-time get).

### Claim ordering (required)

`claimCredential` / dual-format claim must not call the current v2 branches while `isWalletCryptoV2Enabled()` is false.

Pinned order for first claim:

```text
User confirms receive
  -> withFirstUseIssuanceSession
       (1 biometric: pending k_cred Keychain bind)
       -> session.activateV2()   // WUA/WIA + set wallet.crypto.v2_enabled TRUE before claim v2 branches
       -> claimCredential(..., {
            pendingCredentialKeyId: session.pendingCredentialKeyId,
            proofSession: session.proofSession,
          })
       -> PoP + save + bind via in-memory proofSession
  -> session wiped
  -> register push with first credential Holder DID (see Push)
```

If `activateV2()` fails, claim does not proceed and `wallet.crypto.v2_enabled` stays false.

Callers must pass the session’s `proofSession` / `pendingCredentialKeyId` so `exchangeService` does not call `createPendingCredentialKey()` or `createProofSigningSession()` again (which would re-prompt).

### Presentation

- If presenting an existing credential key: unchanged — one sign-time Keychain get via `createCredentialKeySigningSession`.
- First-use session is for issuance activation. Do not open cold-start attest activation from presentation unless a future product requirement needs it; out of scope for v1 of this change.

### Legacy wallet-level seed

Do **not** create the legacy wallet Ed25519 seed (`generateWalletKeyIfNeeded`) for v2 greenfield wallets to satisfy push or claim. Protocol paths use per-credential DIDs (ADR 0010).

## Push identity (pinned)

| State | Push registration |
|---|---|
| No credentials yet / v2 not activated | Do not register push; no `getHolderDid()` |
| After first successful claim | Register (or re-register) Expo push token under the **first credential’s Holder DID** (`getCredentialHolderDid(credentialId)`) |
| Additional credentials | Out of scope for this slice: keep registering against the first credential DID unless/until a later push multi-DID design ships. Do not recreate a wallet-level DID for push. |

## One-prompt rule

Project rule: one biometric per user-initiated action.

For first claim this design requires:

- No app-level `confirmBiometricGate` in front of the session’s Keychain gate.
- No Keychain get for PoP or bind during the session — signs/bind use in-memory seeds.
- At most one interactive biometric Keychain operation (the pending `k_cred` write that establishes biometric binding).
- `k_attest` write and bound-credential Keychain persistence must not present a second BiometricPrompt (device verification on Galaxy A26 is part of Done).

## Error handling

| Case | Behavior |
|---|---|
| User cancels the first-use biometric (before/during the single Keychain gate) | Abort claim with existing cancel → friendly UI. Wipe in-memory seeds. If no Keychain entries were written, leave storage unchanged. |
| Cancel or failure **after** `k_attest` and/or pending `k_cred` were written, before successful `activateV2` + claim | **Retain** written Keychain material (same retain-and-retry policy as today’s attest-failure path). Do not set `wallet.crypto.v2_enabled`. Discard pending credential key metadata/Keychain via `discardPendingCredentialKey` when the pending key was created for this abandoned claim and claim did not complete. Keep `k_attest` for retry. Next claim is a new user action → one prompt again; cold start still must **not** retrieve `k_attest`. |
| Keychain write fails mid-session | Fail closed: discard pending credential key from that attempt; do not set `v2_enabled`; log raw redacted error; generic UI message. Retain `k_attest` only if its write already succeeded (retry-friendly). |
| Attest (WUA/WIA) fails after `k_attest` written | Leave v2 disabled; claim does not proceed; retain `k_attest`; retry on next claim action (not on cold start). |
| Reinstall / leftover Keychain secret | First retrieve on a real user action may prompt; that prompt is the action’s one gate. Cold start still must not retrieve. |
| Blank cold start | Never create or retrieve biometric-bound secrets. |

Logging: use scoped wallet logger steps; never log seeds, JWTs, tokens, claims, or PII.

## Prompt copy

All interactive Keychain authentication prompts for credential seed create/retrieve must set explicit titles (product Thai or approved English). Default library string `"Authenticate to retrieve secret"` is a defect if it appears in production UX.

## Testing

### Jest

1. Cold start with no keys: startup path does not `setGenericPassword` / `getGenericPassword` for wallet seed or `k_attest`.
2. Cold start when `k_attest` exists but v2 disabled: still does **not** call `ensureWalletAttestKey` / `activateWalletCryptoV2` / Keychain get on attest service.
3. First claim: exactly one biometric/Keychain auth interaction; `activateV2` runs before claim uses v2 branches; PoP + bind use session seeds (no second get); `createPendingCredentialKey` / `createProofSigningSession` are not called again inside claim when session is supplied.
4. Cancel before Keychain write: no `v2_enabled`; no orphan pending key.
5. Attest failure after `k_attest` write: v2 false; cold start still does not Keychain-get attest; retry claim can proceed as a new one-prompt action.
6. Second claim with v2 enabled: no first-use session; one sign-time get only.
7. Push registration after first claim uses credential Holder DID, not `getHolderDid()`.

### Device (Samsung Galaxy A26)

1. Fresh install → open app → no fingerprint for secret create/retrieve.
2. First claim → exactly one fingerprint → credential saved, v2 enabled.
3. Force attest failure once → kill app → reopen → no fingerprint on open → retry claim → one fingerprint.
4. Later present/claim → one fingerprint per action.
5. Cancel on first claim biometric → recoverable retry with one prompt on the next attempt.

## Related decisions

- ADR 0008 — Keychain-protected Ed25519 production signing
- ADR 0010 — Per-credential signing keys + `k_attest`
- `docs/superpowers/specs/2026-07-01-biometric-gate-consolidation-design.md` — shared app-level gate (storage/unlock); this design covers Keychain seed **timing**, not modality consolidation
- `docs/superpowers/specs/2026-06-29-push-notifications-design.md` — push remains DID-keyed; this slice pins first credential DID after deferral

## Success criteria

- Fresh install cold start never shows Keychain secret biometric before a key-needing user action.
- Cold start after failed attest also never shows Keychain attest retrieve.
- First claim shows exactly one biometric prompt, activates v2 before v2 claim branches, and completes protocol work.
- Biometric-bound Keychain policy remains in force for credential signing seeds after creation.
- Push uses first credential Holder DID after first successful claim.
- `docs/TASKS.md` updated when the implementation slice ships.
