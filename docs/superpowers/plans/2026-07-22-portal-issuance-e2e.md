# Portal Issuance E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the portal-issuance milestone by validating IdCard, Transcript, and Driving Licence issuance on a physical device against `issuer.zenithcomp.co.th:455`, with Issuer redirect contract `walletapp://callback?credential_offer_uri=https://...`.

**Architecture:** Wallet portal code is already shipped (`openCredentialRequestPortal`, `parseIssuanceCallbackUrl`, PID gates, claim screen). This plan adds **native build verification**, a **manual E2E runbook**, **Issuer handoff artifacts**, and **results recording** — not new protocol logic unless E2E finds a gap.

**Tech Stack:** Expo SDK 54, Hermes, `expo-web-browser` (`openAuthSessionAsync`), Yarn, Jest, Android dev client (`npx expo prebuild` / `run-android-device.js`).

**Spec:** `docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md`

## Global Constraints

- OID4VCI claim stays on-device via `@sphereon/oid4vci-client`; no mobile `/exchange/*`.
- Default `ReturnUrl`: `walletapp://callback` (`EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL`).
- Default login base: `https://issuer.zenithcomp.co.th:455/Account/Login` (`EXPO_PUBLIC_ISSUER_LOGIN_URL`).
- Issuer `documentType` values: `IdCard`, `DriverLicense`, `Transcript`.
- PID VP for DL/Transcript happens on **Issuer web**; Wallet only receives final offer URI.
- One biometric prompt per user action (sign-time Keychain gate on claim only).
- Never log offer URLs, tokens, VC payloads, or PII in production logs.
- Package manager: **Yarn only**.

---

## File map

| File | Role |
|------|------|
| `docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md` | Approved acceptance criteria (source of truth) |
| `docs/superpowers/plans/2026-07-22-portal-issuance-e2e.md` | This plan + results table |
| `app.json` | Registers `walletapp` scheme (already present) |
| `src/services/credentials/openCredentialRequestPortal.ts` | Portal open + callback parse |
| `src/services/credentials/parseIssuanceCallbackUrl.ts` | Unwraps `walletapp://callback?credential_offer_uri=...` |
| `src/config/sameDeviceIssuance.ts` | Login URL, ReturnUrl, documentType map |
| `src/services/credentials/credentialGuard.ts` | `canRequestCredentialType`, `readPidGateStatus` |
| `scripts/run-android-device.js` | Device install helper (Windows-friendly) |
| `docs/TASKS.md` | Session log when E2E completes |

No new production TypeScript is required unless Task 8 finds a gap.

---

### Task 1: Baseline automated verification

**Files:**
- Test: `src/services/credentials/parseIssuanceCallbackUrl.test.ts`
- Test: `src/services/credentials/openCredentialRequestPortal.test.ts`
- Test: `src/services/credentials/buildIssuerLoginUrl.test.ts`
- Test: `src/services/credentials/credentialGuard.test.ts`

**Interfaces:**
- Consumes: existing portal/callback implementation
- Produces: green unit test baseline before device work

- [ ] **Step 1: Run focused portal tests**

```bash
cd C:\project\etdaWallet
yarn test src/services/credentials/parseIssuanceCallbackUrl.test.ts src/services/credentials/openCredentialRequestPortal.test.ts src/services/credentials/buildIssuerLoginUrl.test.ts src/services/credentials/credentialGuard.test.ts --runInBand
```

Expected: all tests PASS.

- [ ] **Step 2: Run type-check**

```bash
yarn tsc --noEmit
```

Expected: exit 0 (note any pre-existing unrelated errors separately; do not block E2E on unrelated test-only failures).

- [ ] **Step 3: Record baseline in plan results table (Task 7)**

---

### Task 2: Native build — register `walletapp` scheme

**Files:**
- Modify (generated): `android/app/src/main/AndroidManifest.xml` (after prebuild)
- Reference: `app.json` (`scheme`: includes `"walletapp"`)

**Interfaces:**
- Consumes: `app.json` Expo config
- Produces: dev client APK with `walletapp://` intent filter on device

- [ ] **Step 1: Prebuild Android**

```bash
cd C:\project\etdaWallet
npx expo prebuild --clean --platform android
```

Expected: `android/` directory regenerated without errors.

- [ ] **Step 2: Verify `walletapp` in Android manifest**

```powershell
Select-String -Path android\app\src\main\AndroidManifest.xml -Pattern "walletapp"
```

Expected: at least one match registering the `walletapp` scheme (alongside `etdawallet`, `openid-credential-offer`, `openid4vp`).

- [ ] **Step 3: Install dev build on physical device**

```bash
node scripts/run-android-device.js
```

Or project-equivalent:

```bash
npx expo run:android --device
```

Expected: Wallet dev client installs on target phone (Galaxy A26 or test device).

- [ ] **Step 4: Confirm env on device build**

Ensure `.env` / EAS env includes (defaults OK if unset):

```env
EXPO_PUBLIC_ISSUER_LOGIN_URL=https://issuer.zenithcomp.co.th:455/Account/Login
EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL=walletapp://callback
```

Rebuild if env changed after last native build.

---

### Task 3: Issuer handoff — request sample redirects

**Files:**
- Reference: `docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md` §4

**Interfaces:**
- Consumes: Issuer contract I1–I7
- Produces: three sample post-login URLs (one per `documentType`) for QA

- [ ] **Step 1: Send Issuer team the required redirect shape**

Copy-paste template (replace `<uuid>` / path with live values):

```text
walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3D<uuid>
```

Request one sample URL each for:

| documentType | Wallet row |
|--------------|------------|
| `IdCard` | Thai National ID |
| `Transcript` | Transcript |
| `DriverLicense` | Driving Licence |

- [ ] **Step 2: Confirm Issuer checklist**

| # | Issuer confirms |
|---|-----------------|
| I1 | `walletapp://callback` whitelisted as `ReturnUrl` |
| I2 | Redirect uses `credential_offer_uri` (HTTPS value), not bare `openid-credential-offer://` from browser |
| I3 | Offer GET returns `application/json` |
| I6 | DL/Transcript PID completed in browser before offer redirect |

- [ ] **Step 3: Record Issuer contact date + deploy ETA in Task 7 results table**

---

### Task 4: Manual E2E — ThaID (IdCard)

**Files:**
- Exercise: `app/(tabs)/index.tsx` → `openCredentialRequestPortal('ThaiNationalID')`
- Exercise: `app/(tabs)/credential-offer` claim flow

**Preconditions:**
- Fresh wallet OR no active ThaID VC on Home row
- PIN unlocked, holder key ready

- [ ] **Step 1: Open portal from Home**

Wallet Home → Thai National ID row (no VC) → tap **ขอเอกสาร**.

Expected log tags (Metro / wallet logger): `issuer-portal-open` with `credentialType: ThaiNationalID`.

- [ ] **Step 2: Complete Issuer login**

Log in on Issuer web with test account.

Expected: browser closes; app receives redirect (not Android app chooser).

- [ ] **Step 3: Verify callback shape**

In dev logs, confirm `issuer-portal-return-offer` (not `issuer-portal-unrecognized-return`).

Redirect must match:

```text
walletapp://callback?credential_offer_uri=https://issuer.zenithcomp.co.th:455/...
```

- [ ] **Step 4: Complete claim**

Credential-offer screen → resolve → biometric sign → save.

Pass: ThaID card appears on Home; history shows issuance event.

- [ ] **Step 5: Record row in Task 7 results table**

---

### Task 5: Manual E2E — Transcript

**Preconditions:**
- **Usable ThaID** in wallet (from Task 4 or existing)
- No Transcript VC on Home row

- [ ] **Step 1: Confirm PID gate allows request**

Home Transcript row shows **ขอเอกสาร** (not blocked).

If blocked without ThaID → expected N1 behavior; fix holder state first.

- [ ] **Step 2: Portal → login → callback → claim**

Same steps as Task 4 with `ChulalongkornUniversityTranscript` / Issuer `documentType=Transcript`.

Pass: Transcript VC saved; card renders on Home.

- [ ] **Step 3: Record row in Task 7 results table**

---

### Task 6: Manual E2E — Driving Licence

**Preconditions:**
- Usable ThaID in wallet
- No DL VC on Home row

- [ ] **Step 1: Portal → login → callback → claim**

Issuer `documentType=DriverLicense`.

Pass: DL VC saved (SD-JWT and/or mdoc per Issuer offer); DL card on Home.

- [ ] **Step 2: Record row in Task 7 results table**

Note which configuration IDs Issuer returned (`Iso18013DriversLicenseCredential_dc+sd-jwt`, `org.iso.18013.5.1.mDL`).

---

### Task 7: Negative cases + results recording

**Files:**
- Modify: `docs/TASKS.md` (session entry when milestone closes)
- Modify: `docs/superpowers/plans/2026-07-22-portal-issuance-e2e.md` (results table below)

- [ ] **Step 1: N1 — request DL/Transcript without ThaID**

Use wallet with **no** usable ThaID.

Expected: **ขอเอกสาร** not offered OR PID dialog; portal must not complete claim.

- [ ] **Step 2: N2 — dismiss browser before redirect**

Start portal flow → close in-app browser without Issuer redirect.

Expected: “รอรับเอกสาร” dialog; optional **ไป Scan**.

- [ ] **Step 3: Fill results table**

| Field | Value |
|-------|--------|
| Date | 2026-07-22 |
| Device model / Android version | _pending device E2E_ |
| App commit / build | _pending_ |
| Unit tests (Task 1) | **PASS** (4 suites, 25 tests) |
| `yarn tsc --noEmit` | **FAIL** (pre-existing: `claimDisclosurePolicy.ts`, `exchangeService.ts` test cast; fixed `sameDeviceIssuanceStore` imports) |
| `walletapp` in AndroidManifest (Task 2) | **PASS** — line 46 `<data android:scheme="walletapp"/>` (prebuild exit 0) |
| Issuer deploy confirmed | Y (agreed/in progress) |
| Issuer handoff doc | `docs/superpowers/specs/2026-07-22-portal-issuance-issuer-handoff.md` |
| E2E IdCard | **BLOCKED** — requires device + Issuer redirect live |
| E2E Transcript | **BLOCKED** — requires device + Issuer redirect live |
| E2E Driving Licence | **BLOCKED** — requires device + Issuer redirect live |
| N1 PID gate | **BLOCKED** — device manual |
| N2 dismiss browser | **BLOCKED** — device manual |
| Sample redirect URLs received | N (request via handoff doc) |
| **Overall milestone** | **IN PROGRESS** (Wallet code + unit tests ready; device E2E pending) |

- [ ] **Step 4: Update `docs/TASKS.md`**

Add session entry under `### Session YYYY-MM-DD (Portal issuance E2E — validated)` with overall PASS/FAIL, device, commit, and link to this plan’s results table.

Example bullet:

```markdown
### Session 2026-07-XX (Portal issuance E2E — validated)

- Device E2E PASS for IdCard, Transcript, Driving Licence (`walletapp://callback?credential_offer_uri=...`).
- Plan/results: `docs/superpowers/plans/2026-07-22-portal-issuance-e2e.md`.
```

---

### Task 8: Gap remediation (only if E2E fails)

**Files:** TBD based on failure — do **not** start until Task 4–6 identify a specific gap.

**Common gaps and fixes:**

| Symptom | Likely fix |
|---------|------------|
| App chooser after login | Issuer still redirecting to bare `openid-credential-offer://` → Issuer must use wrapped callback (Task 3) |
| `issuer-portal-unrecognized-return` | Missing/wrong query param → Issuer must send `credential_offer_uri` |
| Session dismiss, no URL | `ReturnUrl` not whitelisted on Issuer |
| Claim/token failure | Issuer offer grants / token endpoint / EdDSA PoP — check `exchangeService` logs (redacted) |
| Portal button missing | PID gate — expected without ThaID for DL/Transcript |

- [ ] **Step 1: Document failure with log tags + callback URL shape (redact offer id if sharing externally)**

- [ ] **Step 2: Implement minimal Wallet fix OR escalate to Issuer per symptom table**

- [ ] **Step 3: Re-run failed matrix row only**

---

### Task 9: Optional cleanup (non-blocking)

**Files:**
- Reference only: `src/services/credentials/sameDeviceIssuance.ts`, `src/store/sameDeviceIssuanceStore.ts`, auth-code paths in `src/services/vci/exchangeService.ts`
- Spec: rename note in `docs/superpowers/specs/2026-07-20-same-device-authorization-code-issuance-design.md`

- [ ] **Step 1: Add comment in dead orchestrator files: “Not used — portal offer-URI path; see 2026-07-22 E2E spec”**

- [ ] **Step 2: Do NOT delete auth-code exchange helpers until PM confirms no future OAuth path**

Skip this task if time-constrained; E2E milestone does not depend on it.

---

## Spec coverage self-review

| Spec section | Plan task |
|--------------|-----------|
| §2 Locked decisions | Global Constraints + Tasks 4–6 |
| §3 End-to-end flow | Tasks 4–6 manual steps |
| §4 Issuer contract | Task 3 |
| §5 Wallet responsibilities | Tasks 1–2 |
| §6 E2E matrix | Tasks 4–7 |
| §7 Error handling | Task 7 N1–N2, Task 8 |
| §8 Remaining work | Entire plan |
| §9 Out of scope | Task 9 optional only |

No TBD steps in executable tasks. Task 8 files are intentionally conditional on failure.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-07-22-portal-issuance-e2e.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — run tasks in this session with checkpoints (start with Task 1 + Task 2)

Which approach do you want?
