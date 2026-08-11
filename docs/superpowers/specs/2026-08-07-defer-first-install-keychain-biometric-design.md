# Defer First-Install Keychain Biometric Design

**Date:** 2026-08-07  
**Status:** Implemented (device validation pending on Galaxy A26)  
**Scope:** Remove the blank first-install Keychain fingerprint prompt ("Authenticate to retrieve secret") by deferring Keychain seed create/retrieve off cold start, and completing every new-credential claim with exactly one biometric prompt (issuance-only; presentation activation out of scope).

## Context

On a fresh install, cold start currently calls `generateWalletKeyIfNeeded()` and often `activateWalletCryptoV2()` → `ensureWalletAttestKey()` from `app/_layout.tsx` `prepareWallet`. Those paths write Ed25519 seeds to `react-native-keychain` with `BIOMETRY_ANY_OR_DEVICE_PASSCODE` + `AES_GCM`. On Android, binding a secret to biometrics commonly prompts fingerprint at **write** time. The write path does not set `authenticationPrompt`, so the OS/library default English string `"Authenticate to retrieve secret"` appears even though the wallet is empty.

This is intentional Keychain policy under ADR 0008 / ADR 0010, but the **timing** is poor UX: the Holder has not yet performed a key-needing action.

Storage unlock is a separate path (`initStorage` / Android `AES_GCM_NO_AUTH` + app-level gate when a session exists) and is **out of scope**.

## Goals

1. Blank first install / cold start with no keys: **no** fingerprint for Keychain secret create or retrieve.
2. Every claim that creates a new credential key: **exactly one** biometric prompt for that user action (create/PoP/bind, plus v2 activation on first claim).
3. The **lasting** credential signing seed (bound `wallet.ed25519_seed.cred.{credentialId}`) stays biometric-bound (`BIOMETRY_ANY_OR_DEVICE_PASSCODE` + `AES_GCM`) per ADR 0008 / 0010.
4. Explicit prompt titles (Thai / product copy) — never rely on the default retrieve-secret string.
5. Presentation of an **existing** credential key: one sign-time Keychain get (unchanged). No first-use / attest activation from presentation in this slice.

## Non-goals

- Changing Wallet PIN / storage unlock / PIN-fallback startup UX.
- Hardware AndroidKeyStore Ed25519 (still blocked per ADR 0008 / hardware validation work).
- Removing biometric access control from per-credential signing seeds.
- Reworking modality (fingerprint vs face) — covered by the existing biometric-gate consolidation work.
- Full push multi-DID server redesign (only pin which DID is used after deferral).
- Opening wallet-attest activation from the presentation approve path.

## Decision

**Approach: defer cold-start Keychain work + short-lived issuance key session on every new-credential claim.**

Cold start never performs Keychain get/set for wallet seed, `k_attest`, or credential seeds. Each claim that needs a new pending credential key opens an issuance key session that keeps the pending seed in memory through PoP, activates v2 when needed (reusing `k_attest` if present), then performs **exactly one** biometric Keychain write of the final bound credential service.

Rejected alternatives:

| Alternative | Why rejected |
|---|---|
| Create seeds without biometric binding (`AES_GCM_NO_AUTH`), gate only on read | Weakens at-rest protection for credential signing seeds vs ADR 0008 |
| Keep eager create; only polish prompt copy | Fails the no-blank-install-scan goal |
| Device-bound (non-`BIOMETRY_*`) write of the **bound** credential seed | Presentation reads the bound service; lasting key would lose sign-time biometric get |

## Architecture

### Cold start (`prepareWallet`)

Hard rules (no exceptions for "retry activation"):

1. Keep device integrity, runtime policy, and storage init as today.
2. **Never** call `generateWalletKeyIfNeeded()` on cold start for a greenfield / empty-key wallet.
3. **Never** call `activateWalletCryptoV2()` or `ensureWalletAttestKey()` on cold start — including when `k_attest` already exists but `wallet.crypto.v2_enabled` is still false (failed prior attest). Activation is only from a user **claim** action.
4. **Never** call `getHolderDid()` / push registration on cold start when no push identity has been established yet.
5. App reaches ready/empty-wallet UI without Keychain biometric create or retrieve prompts.

Legacy single-key wallets (`detectLegacySingleKeyWallet`) remain an error path as today; this design does not revive wallet-level seed creation for v2.

### Issuance key session (required API)

Chained helpers today cannot meet the one-prompt rule:

- `createPendingCredentialKey` writes then wipes the seed (and can prompt on set)
- `createCredentialKeySigningSession` / `createProofSigningSession` re-reads Keychain (second prompt)
- `bindPendingKeyToCredential` reads pending then writes the bound service (more Keychain auth)
- `ensureWalletAttestKey` may regenerate or prompt on write/get

Therefore every new-credential claim must use a **new** session API (name illustrative) in `src/services/crypto/`:

```ts
withIssuanceKeySession<T>(
  run: (session: IssuanceKeySession) => Promise<T>,
): Promise<T>

type IssuanceKeySession = {
  pendingCredentialKeyId: string
  /** Proof session that signs from the in-memory pending seed (no Keychain get). */
  proofSession: ProofSigningSession
  /**
   * First claim only when v2 is not enabled: WUA/WIA + set wallet.crypto.v2_enabled.
   * Reuses existing k_attest / cached public JWK when present; never overwrites.
   */
  activateV2IfNeeded: () => Promise<void>
}
```

**Session mechanics (pinned):**

1. **Attest reuse:** If a cached attest public JWK already exists (and/or device-bound `k_attest` was retained from a prior attempt), **reuse it** — do not generate a new attest seed or overwrite Keychain. Generate and persist `k_attest` only when absent. Persist new `k_attest` with device-bound Keychain options that do **not** trigger a biometric prompt (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, no `BIOMETRY_*` on that write). Claim-time activation needs only the public JWK (from cache or freshly derived in memory). Cold start still never reads `k_attest`.
2. Generate a pending `k_cred` seed **in memory only**. Assign `pendingCredentialKeyId` and pending metadata as needed, but **do not** `setGenericPassword` the pending seed under biometric policy (avoids a prompt that is not the lasting key).
3. Expose `proofSession.signProof` from the in-memory pending seed (no Keychain get).
4. **Bind (single biometric Keychain write):** After credential id is known, write the seed once to `wallet.ed25519_seed.cred.{credentialId}` with `BIOMETRY_ANY_OR_DEVICE_PASSCODE` + `AES_GCM` and an explicit `authenticationPrompt` (Thai/product copy). Register the credential key record pointing at that service. Clear pending metadata. **Do not** write a second Keychain copy, **do not** allow a non-`BIOMETRY_*` bound write, and **do not** delete a biometric pending entry after a second set — pending was memory-only. This one bind write is the only interactive biometric for the claim action.
5. `close` / `finally`: wipe in-memory seeds even on failure.

**Fallback explicitly rejected:** writing the bound service without `BIOMETRY_*` and relying on a later get — presentation reads the bound service; that would drop ADR 0008 protection for the lasting key.

When the claim already has a bound credential key and only needs to sign (not create), use today’s `createProofSigningSession(credentialKeyId)` (one sign-time get). That is not this session.

### Claim ordering (required)

`claimCredential` / dual-format claim must not call the current v2 branches while `isWalletCryptoV2Enabled()` is false.

Pinned order for a new-credential claim:

```text
User confirms receive
  -> withIssuanceKeySession
       -> session.activateV2IfNeeded()
            // if v2 already enabled: no-op
            // else: reuse k_attest/JWK if present; else create device-bound k_attest;
            //       WUA/WIA; set wallet.crypto.v2_enabled TRUE before claim v2 branches
       -> claimCredential(..., {
            pendingCredentialKeyId: session.pendingCredentialKeyId,
            proofSession: session.proofSession,
          })
       -> PoP from in-memory seed (no Keychain)
       -> save credential
       -> bind: ONE biometric Keychain write to cred.{credentialId}
  -> session wiped
  -> after first successful claim: register push with that credential Holder DID (see Push)
```

If `activateV2IfNeeded()` fails, claim does not proceed and `wallet.crypto.v2_enabled` stays false.

Callers must pass the session’s `proofSession` / `pendingCredentialKeyId` so `exchangeService` does not call `createPendingCredentialKey()` or `createProofSigningSession()` again (which would re-prompt).

### Later claims (v2 already enabled)

Still use `withIssuanceKeySession` for each **new** pending credential key so create + PoP + bind remain one biometric (the bind write). Do **not** expect “sign-time get only” for new-credential issuance — that applies only to presenting/signing with an already-bound key.

### Presentation

- Existing credential key: unchanged — one sign-time Keychain get via `createCredentialKeySigningSession`.
- Do **not** run issuance/attest activation from presentation in this slice.

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

For each new-credential claim:

- No app-level `confirmBiometricGate` in front of the session’s Keychain gate.
- No Keychain get for PoP during the session — signs use in-memory seeds.
- Exactly one interactive biometric Keychain operation: the **bound** `cred.{credentialId}` write at bind time.
- `k_attest` create/reuse must not present a BiometricPrompt (device-bound write / cache-only reuse).

## Error handling

| Case | Behavior |
|---|---|
| User cancels the bind-time biometric | Abort claim with existing cancel → friendly UI. Wipe in-memory seeds. No bound Keychain entry. Discard pending metadata. If an MMKV credential record was written before bind, roll it back so claim is not half-complete. |
| Failure before bind (including attest / token / PoP failure) | Wipe in-memory pending seed. Discard pending metadata. **Retain** existing `k_attest` / cached JWK if already present — do not overwrite on the next claim. `v2_enabled` set only if activation fully succeeded. Cold start still must **not** retrieve `k_attest`. |
| `k_attest` already present from a failed prior attest | Next claim’s `activateV2IfNeeded` **reuses** that key/JWK; never generate-and-overwrite. |
| Keychain bind write fails | Fail closed: no registry row for that credentialId; discard pending metadata; log raw redacted error; generic UI. Retain `k_attest` if present. |
| Attest (WUA/WIA) fails after first `k_attest` create | Leave v2 disabled; claim does not proceed; retain `k_attest` + cached JWK; retry on next claim (not on cold start). |
| Reinstall / leftover Keychain secret | First retrieve on a real user action may prompt; that prompt is the action’s one gate. Cold start still must not retrieve. |
| Blank cold start | Never create or retrieve biometric-bound secrets. |

Logging: use scoped wallet logger steps; never log seeds, JWTs, tokens, claims, or PII.

## Prompt copy

All interactive Keychain authentication prompts for credential seed create/retrieve must set explicit titles (product Thai or approved English). Default library string `"Authenticate to retrieve secret"` is a defect if it appears in production UX.

## Testing

### Jest

1. Cold start with no keys: startup path does not `setGenericPassword` / `getGenericPassword` for wallet seed or `k_attest`.
2. Cold start when `k_attest` exists but v2 disabled: still does **not** call `ensureWalletAttestKey` / `activateWalletCryptoV2` / Keychain get on attest service.
3. First claim: exactly one biometric Keychain interaction (bound write); `activateV2IfNeeded` runs before claim uses v2 branches; PoP uses memory (no get); `createPendingCredentialKey` / `createProofSigningSession` are not called again inside claim when session is supplied; bound service uses `BIOMETRY_*`.
4. Cancel at bind biometric: no `v2_enabled` unless activation already completed earlier in a prior successful activation; no bound credential key; no orphan pending Keychain seed.
5. Attest failure after `k_attest` create: v2 false; cold start still does not Keychain-get attest; retry claim **reuses** same attest JWK (no overwrite) and still one biometric at bind.
6. Second **new-credential** claim with v2 enabled: still uses issuance key session; exactly one biometric (bound write); not “get only.”
7. Presentation of existing credential: one sign-time get; no issuance session.
8. Push registration after first claim uses credential Holder DID, not `getHolderDid()`.

### Device (Samsung Galaxy A26)

1. Fresh install → open app → no fingerprint for secret create/retrieve.
2. First claim → exactly one fingerprint (at bind) → credential saved, v2 enabled; later present prompts once on get.
3. Force attest failure once → kill app → reopen → no fingerprint on open → retry claim → reuses attest → one fingerprint at bind.
4. Second new-credential claim → one fingerprint at bind.
5. Cancel on bind biometric → recoverable retry with one prompt on the next attempt.

## Related decisions

- ADR 0008 — Keychain-protected Ed25519 production signing
- ADR 0010 — Per-credential signing keys + `k_attest`
- `docs/superpowers/specs/2026-07-01-biometric-gate-consolidation-design.md` — shared app-level gate (storage/unlock); this design covers Keychain seed **timing**, not modality consolidation
- `docs/superpowers/specs/2026-06-29-push-notifications-design.md` — push remains DID-keyed; this slice pins first credential DID after deferral

## Success criteria

- Fresh install cold start never shows Keychain secret biometric before a claim action.
- Cold start after failed attest also never shows Keychain attest retrieve.
- Every new-credential claim shows exactly one biometric prompt; lasting bound seed remains `BIOMETRY_*`-protected.
- First claim activates v2 before v2 claim branches; retry reuses `k_attest` without overwrite.
- Push uses first credential Holder DID after first successful claim.
- `docs/TASKS.md` updated when the implementation slice ships.
