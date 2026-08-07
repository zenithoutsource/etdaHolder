# Defer First-Install Keychain Biometric Design

**Date:** 2026-08-07  
**Status:** Approved for implementation planning  
**Scope:** Remove the blank first-install Keychain fingerprint prompt ("Authenticate to retrieve secret") by deferring biometric-bound seed creation until the first claim/sign action, with exactly one biometric prompt for that action.

## Context

On a fresh install, cold start currently calls `generateWalletKeyIfNeeded()` and often `activateWalletCryptoV2()` → `ensureWalletAttestKey()` from `app/_layout.tsx` `prepareWallet`. Those paths write Ed25519 seeds to `react-native-keychain` with `BIOMETRY_ANY_OR_DEVICE_PASSCODE` + `AES_GCM`. On Android, binding a secret to biometrics commonly prompts fingerprint at **write** time. The write path does not set `authenticationPrompt`, so the OS/library default English string `"Authenticate to retrieve secret"` appears even though the wallet is empty.

This is intentional Keychain policy under ADR 0008 / ADR 0010, but the **timing** is poor UX: the Holder has not yet performed a key-needing action.

Storage unlock is a separate path (`initStorage` / Android `AES_GCM_NO_AUTH` + app-level gate when a session exists) and is **out of scope**.

## Goals

1. Blank first install / cold start with no keys: **no** fingerprint for Keychain secret create.
2. First claim or first presentation that needs a new/unlocked key: **exactly one** biometric prompt for the whole user action (create + attest + PoP/sign).
3. Keep biometric-bound Keychain protection for seeds (do not switch signing seeds to permanently unauthenticated storage).
4. Explicit prompt titles (Thai / product copy) — never rely on the default retrieve-secret string.
5. Later claim/sign actions keep the existing one prompt per action (sign-time Keychain get).

## Non-goals

- Changing Wallet PIN / storage unlock / PIN-fallback startup UX.
- Hardware AndroidKeyStore Ed25519 (still blocked per ADR 0008 / hardware validation work).
- Removing Keychain biometric access control from production signing seeds.
- Reworking modality (fingerprint vs face) — covered by the existing biometric-gate consolidation work.

## Decision

**Approach: defer create + short-lived first-use crypto session.**

Cold start does not perform biometric-bound Keychain writes for the wallet seed or `k_attest` when those keys do not yet exist. The first key-needing user action opens a short-lived session that performs one biometric gate, creates the required secrets, runs attest/sign from in-memory seeds, then wipes memory.

Rejected alternatives:

| Alternative | Why rejected |
|---|---|
| Create seeds without biometric binding (`AES_GCM_NO_AUTH`), gate only on read | Weakens at-rest protection vs ADR 0008 |
| Keep eager create; only polish prompt copy | Fails the no-blank-install-scan goal |

## Architecture

### Cold start (`prepareWallet`)

1. Keep device integrity, runtime policy, and storage init as today.
2. **Skip** eager `generateWalletKeyIfNeeded()` when no wallet public key / seed is present.
3. **Skip** eager `activateWalletCryptoV2()` when v2 is not enabled and `k_attest` is not yet provisioned.
4. Do not call `getHolderDid()` / push registration until a DID exists (defer push start).
5. App reaches ready/empty-wallet UI without Keychain biometric create prompts.

If keys already exist from a prior session, startup must not invent a second app-level biometric in front of later sign-time gates. Any retrieve needed only for a concrete user action uses that action’s single Keychain gate.

### First-use crypto session

New choke point in crypto services (name illustrative): `ensureFirstUseCryptoSession()`.

| Unit | Responsibility |
|---|---|
| `ensureFirstUseCryptoSession` | If required keys missing: one biometric → create `k_attest` and (for claim) pending `k_cred` under existing Keychain biometric policy → expose in-memory seeds to the caller → wipe on exit. If keys already exist: no-op / return normal signing path. |
| `claimCredential` / dual-format claim | Enter the session before pending-key create, wallet attest activation, and PoP so first claim is one gated action. |
| Presentation approve path | Use the same helper only when that action must create or first-retrieve a biometric-bound seed; otherwise existing sign-time Keychain get remains the single gate. |
| Legacy `generateWalletKeyIfNeeded` | Not required for v2 protocol paths (ADR 0010). If push or another caller still needs a wallet-level DID, create it **inside** the first-use session, never on blank cold start. |

### First-claim data flow

```text
User confirms receive
  -> ensureFirstUseCryptoSession (exactly one biometric)
  -> create/bind k_attest in Keychain
  -> activate wallet crypto v2 (WUA/WIA) using in-memory attest material as needed
  -> create pending k_cred in Keychain
  -> OID4VCI PoP sign from in-memory credential seed
  -> save credential + bind pending key
  -> wipe session memory
  -> done
```

### Later claim / present

No first-use session. Normal ADR 0010 path: sign-time Keychain `getGenericPassword` is the single authentication event for that action.

## One-prompt rule

Project rule: one biometric per user-initiated action.

For first claim/sign this design requires:

- No separate app-level `confirmBiometricGate` in front of a Keychain sign/get for the same action.
- Key creation and PoP/sign in the first-use path must share **one** authentication event (Keychain binding/retrieve for the session, or an equivalent single gate that unlocks the in-memory session — not write prompt + read prompt + app-level gate).
- Implementation must set `authenticationPrompt` on Keychain set/get used in this path so Android does not show the default English retrieve-secret copy.

## Error handling

| Case | Behavior |
|---|---|
| User cancels the first-use biometric | Abort claim/present with existing cancel → friendly UI mapping. Wipe in-memory seeds. Do not leave wallet half-activated. |
| Keychain write fails mid-session | Fail closed: delete orphan pending Keychain entries from that attempt; do not set `wallet.crypto.v2_enabled`; log raw redacted error; surface generic UI message. |
| Attest (WUA/WIA) fails after keys written | Preserve today’s activation semantics: leave v2 disabled until attest succeeds. Claim does not proceed. Retry is a new user action → one prompt again. |
| Reinstall / leftover Keychain secret | First retrieve may prompt; that prompt is the action’s one gate. Do not add a second app-level prompt. |
| Blank cold start | Never create biometric-bound secrets; never block on fingerprint for key setup. |

Logging: use scoped wallet logger steps; never log seeds, JWTs, tokens, claims, or PII.

## Prompt copy

All Keychain authentication prompts in create and retrieve paths for wallet / attest / credential seeds must set explicit titles (product Thai or approved English), for example create/bind vs unlock-for-sign. Default library string `"Authenticate to retrieve secret"` is a defect if it appears in production UX.

## Testing

### Jest

1. Cold start with no keys: startup path does not `setGenericPassword` for wallet seed / `k_attest`.
2. First claim: biometric/Keychain auth invoked exactly once; attest + pending key + PoP complete inside the session.
3. Cancel on first-use gate: claim aborts; `wallet.crypto.v2_enabled` unset; no orphan pending credential key.
4. Second claim with keys present: no first-use session; one sign-time get only.
5. Keychain options in first-use / write paths include `authenticationPrompt`.

### Device (Samsung Galaxy A26 + project reader constraints as applicable)

1. Fresh install → open app → no fingerprint for secret create.
2. First claim → exactly one fingerprint → credential saved.
3. Later present/claim → one fingerprint per action.
4. Cancel on first claim biometric → recoverable retry with one prompt on the next attempt.

## Related decisions

- ADR 0008 — Keychain-protected Ed25519 production signing
- ADR 0010 — Per-credential signing keys + `k_attest`
- `docs/superpowers/specs/2026-07-01-biometric-gate-consolidation-design.md` — shared app-level gate (storage/unlock); this design covers Keychain seed **timing**, not modality consolidation

## Success criteria

- Fresh install cold start never shows Keychain secret biometric before a key-needing user action.
- First claim/sign shows exactly one biometric prompt and completes protocol work.
- Biometric-bound Keychain policy for seeds remains in force after creation.
- `docs/TASKS.md` updated when the implementation slice ships.
