# ADR 0004 - Response to Detected Root or Jailbreak: Hard Block at Startup

Status: Accepted

Date: 2026-06-07

## Context

The wallet holds a hardware-bound, non-extractable signing key (`@animo-id/expo-secure-environment`) and locally stored credential claims under encrypted MMKV. `docs/SECURITY.md` already requires production startup to fail when the native hardware secure environment is unavailable.

A rooted Android device or jailbroken iOS device can undermine those guarantees even when the secure-environment module reports support: OS-level integrity checks, Keychain/Keystore access-control enforcement, and biometric gating can all be bypassed or spoofed by an attacker (or the device owner) with elevated privileges.

Three response options were considered for a detected compromised device:

- Hard block at startup: refuse to start, no bypass.
- Warn but allow continued use: show a dismissible warning, let the user proceed.
- Block only sign-time operations: allow viewing stored credentials, refuse `signProof()`/issuance.

## Decision

Hard block at startup using `jail-monkey`'s `isJailBroken()` check, wired into the same `prepareWallet()` startup sequence in `app/_layout.tsx` that already asserts hardware secure environment availability (`src/services/security/deviceIntegrityPolicy.ts`). On detection, startup fails with `DeviceIntegrityCompromised` and the user sees a blocking message; there is no bypass path.

## Consequences

- Legitimate users running custom ROMs or who have rooted their device for unrelated reasons are locked out entirely, even though their specific use would have been safe. This is the real cost of this decision.
- This matches the existing strict posture for the hardware secure environment: the wallet treats "cannot guarantee key and storage isolation" as a hard precondition, not a risk to be communicated and left to the user.
- A warn-only or sign-time-only approach would have let a compromised device retain decrypted credential claims in JS memory and encrypted storage reachable by privileged processes — inconsistent with the zero-raw-key-exposure and no-PII-leak baselines in `docs/SECURITY.md`.
- Reversing this decision (e.g., to a softer warning) should require a superseding ADR, since it changes the wallet's trust boundary for the device itself.
