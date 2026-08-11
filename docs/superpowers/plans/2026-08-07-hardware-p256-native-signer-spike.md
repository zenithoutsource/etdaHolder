# Hardware P-256 Native Signer Spike (Galaxy A26)

**Date opened:** 2026-08-07  
**Spec:** [`docs/superpowers/specs/2026-08-04-hardware-p256-es256-signing-design.md`](../specs/2026-08-04-hardware-p256-es256-signing-design.md)  
**Slice:** B — resolver, Animo adapter, A26 spike, conditional custom-module scaffold  
**Production cutover:** Slice C (not in this slice)

## Goal

Validate `@animo-id/expo-secure-environment@0.1.5` against the full `HardwareEcdsaSigner` facade on Samsung Galaxy A26 + ACR1311U-N2 reader profile firmware. Record go/no-go before rewiring `crypto.ts` behind `EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED`.

## Build prerequisites

1. Set in `.env` (dev build only):

   ```env
   EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED=true
   EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND=animo
   ```

2. Rebuild native project after dependency/module changes:

   ```bash
   npx expo prebuild --clean
   yarn android
   ```

3. Optional dev probe (logs tagged `[hardware-ecdsa]`, no key material):

   ```ts
   import {
     formatSliceBChecklistReport,
     runHardwareEcdsaSliceBChecklist,
   } from '@/src/services/crypto/hardwareEcdsaDiagnostics'

   // Full Slice B table (rows 1,2,3,4,6,10) with PASS/FAIL/SKIPPED evidence:
   const report = await runHardwareEcdsaSliceBChecklist({
     // Row 3: pass WP attestation challenge bytes when available
     // attestationChallenge: challengeBytes,
     skipCapacityStress: false, // set true for a faster smoke pass
   })
   console.info(formatSliceBChecklistReport(report))
   // Copy report.rows evidence into the checklist table below.

   // Quick row-1-only (legacy):
   // import { runHardwareEcdsaDevProbes } from '@/src/services/crypto/hardwareEcdsaDiagnostics'
   // await runHardwareEcdsaDevProbes()
   ```

## Static contract review (pre-device, 2026-08-07)

Source review of Animo 0.1.5 + wallet adapter:

| Facade requirement | Static result | Notes |
|---|---|---|
| StrongBox-first P-256 create | **FAIL** | Animo `generateKeypair` does not expose StrongBox selection or explicit StrongBox-unavailable → TEE fallback |
| `getSecurityLevel` (`STRONGBOX` / `TEE`) | **PARTIAL** | Wallet probe module `ExpoWalletHardwareEcdsa` reads `KeyInfo`; depends on how Animo creates keys |
| `createKey` + attestation challenge | **FAIL** | Adapter throws `AnimoAttestationAtCreateUnsupported`; Animo has no challenge-at-create API |
| Action-scoped session (one biometric, TTL, max sigs) | **PARTIAL** | TS session wrapper enforces TTL/max; Animo still uses per-op biometric flag (first sign biometric, rest non-biometric) — not Android auth-validity window |
| Opaque session handle | **PASS (TS)** | JS handle with alias/purpose/expiry binding; not a native CryptoObject handle |
| ES256 64-byte `r‖s` | **PASS** | Animo `sign()` returns P1363 raw signature |
| `deleteKey` | **PASS (API)** | Animo exposes `deleteKey`; verify alias removal on device |
| Fail closed on generic keygen errors | **UNKNOWN** | Requires A26 create failure injection |

**Pre-device go/no-go:** **FAIL** on attestation-at-create and StrongBox policy. Proceed with **custom module scaffold** (`modules/expo-wallet-hardware-ecdsa/`) for full facade; keep Animo adapter for spike comparison.

## A26 device checklist

Run on Galaxy A26 dev build. Mark each row after physical execution.

| # | Gate (spec device gate) | Result | Evidence |
|---|---|---|---|
| 1 | StrongBox P-256: create → session sign → verify → `securityLevel == STRONGBOX` | **PENDING** | |
| 2 | Explicit StrongBox-unavailable → TEE create; generic failure does **not** fallback | **PENDING** | |
| 3 | `createKey` + attestation challenge → chain accepted by WP mock/dev endpoint | **PENDING** | Requires custom backend |
| 4 | Capacity stress: N per-credential keys → OEM limit / `ERROR_TOO_MANY_KEYS` | **PENDING** | |
| 6 | Action-scoped session: one biometric for dual PoP + nonce retry; observe residual window after `close()` | **PENDING** | |
| 10 | Animo vs full facade contract | **FAIL (static)** | See static table; re-run on device to confirm |

### Procedure (rows 1, 2, 6, 10 — Animo backend)

1. Fresh install dev build; enable hardware flag (above).
2. Call `runHardwareEcdsaDevProbes()` or manual flow via diagnostics hook.
3. Record `createKey` security level from logs (`[hardware-ecdsa]`).
4. Open session with `purpose: oid4vci`, `maxSignatures: 2`; sign twice; confirm single biometric prompt (if Animo allows).
5. Call `getSecurityLevel` and compare with `KeyInfo` expectation.
6. `deleteKey`; confirm `hasKey === false`.
7. Switch `EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND=custom` and re-run rows 1–4, 6 with the full custom module.

### Procedure (row 3 — custom backend only)

1. Set `EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND=custom`.
2. Implement remaining custom module methods post-spike (Slice C+).
3. Create `wallet.p256.attest` with WP challenge bytes.
4. Submit chain to dev WP attestation endpoint; record HTTP result.

### Procedure (row 4 — capacity)

1. Loop `createKey` with unique `wallet.p256.cred.pending.*` aliases until failure.
2. Record alias count at failure and native error code/message (redacted in logs).

## Implemented artifacts (Slice B)

| Artifact | Path |
|---|---|
| Resolver | `src/services/crypto/hardwareEcdsaSigner.ts` |
| Animo adapter | `src/services/crypto/hardwareEcdsaSigner.animo.ts` |
| Custom scaffold | `src/services/crypto/hardwareEcdsaSigner.custom.ts` |
| Custom AndroidKeyStore module | `modules/expo-wallet-hardware-ecdsa/` (createKey, session sign, attestation, KeyInfo) |
| Dev probes | `src/services/crypto/hardwareEcdsaDiagnostics.ts` |
| DER helpers (legacy/native DER paths) | `src/services/crypto/animoDerP256.ts` |

## Decision log

| Date | Decision |
|---|---|
| 2026-08-07 | Installed `@animo-id/expo-secure-environment@0.1.5`; adapter maps facade with documented gaps |
| 2026-08-07 | Static review **FAIL** on attestation-at-create + StrongBox policy → scaffold `expo-wallet-hardware-ecdsa` |
| 2026-08-07 | Custom AndroidKeyStore module implemented (`expo-wallet-hardware-ecdsa`); re-run A26 checklist with `EXPO_PUBLIC_HARDWARE_ECDSA_BACKEND=custom` |

## Next (Slice C)

- Rewire holder signing entry points behind `EXPO_PUBLIC_HARDWARE_P256_SIGNING_ENABLED`
- Complete custom AndroidKeyStore module if A26 confirms static FAIL
- New ADR + SECURITY.md + TASKS.md after backend locked
