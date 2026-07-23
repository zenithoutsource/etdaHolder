# Portal Issuance E2E — Design Spec

Status: **Approved** (2026-07-22)
Scope: Same-device issuance via Issuer login portal for **IdCard**, **Transcript**, and **Driving Licence**

Related:

- Portal callback implementation: `docs/superpowers/specs/2026-07-20-same-device-authorization-code-issuance-design.md`
- Wallet Home portal UX: `docs/superpowers/specs/2026-06-29-issuer-portal-request-design.md`

---

## 1. Goal

Validate end-to-end Standard VC issuance when the Holder taps **ขอเอกสาร** on Wallet Home, completes Issuer web login, and returns to the Wallet via a **`walletapp://callback`** redirect carrying a **credential offer URI**.

Milestone is complete only when **all three document types** pass on a physical device against the live Issuer (`issuer.zenithcomp.co.th:455`).

---

## 2. Locked decisions

| Topic | Decision |
|-------|----------|
| Milestone scope | All three: ThaID (IdCard), Transcript, Driving Licence |
| Portal entry | `/Account/Login?ReturnUrl=walletapp://callback&documentType=...` |
| Post-login payload | `walletapp://callback?credential_offer_uri=<urlencoded https offer URL>` |
| PID VP for DL/Transcript | **Issuer web only** — Wallet receives final offer URI only |
| Wallet PID gate | Existing `canRequestCredentialType` (Home) + `readPidGateStatus` (claim screen) |
| Issuer redirect change | **Agreed / in progress** |
| Wallet OAuth `/authorize` path | Not used on this milestone |
| Portal `openid4vp://` callback | Not required when Issuer completes VP in browser |

---

## 3. End-to-end flow

```
Wallet Home — row without VC, canRequestCredentialType = true
  │
  │ Holder taps ขอเอกสาร
  ▼
openAuthSessionAsync(
  https://issuer.zenithcomp.co.th:455/Account/Login
    ?ReturnUrl=walletapp://callback
    &documentType=IdCard | DriverLicense | Transcript
)
  │
  │ Holder logs in on Issuer web
  │ [Issuer: PID verification in browser for DL/Transcript when required]
  ▼
Redirect:
  walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2F...
  │
  ▼
Wallet: parseIssuanceCallbackUrl → internal openid-credential-offer://?credential_offer_uri=...
  │
  ▼
/(tabs)/credential-offer → resolveOffer → token → proof → save VC
  │
  ▼
Home shows new document card; history records issuance
```

### documentType mapping

| Wallet credential type | Issuer `documentType` query | Expected configuration IDs in offer |
|------------------------|----------------------------|-------------------------------------|
| `ThaiNationalID` | `IdCard` | `IDCard_dc+sd-jwt` |
| `ChulalongkornUniversityTranscript` | `Transcript` | `TranscriptCredential_dc+sd-jwt` |
| `DLTDrivingLicence` | `DriverLicense` | `Iso18013DriversLicenseCredential_dc+sd-jwt`, `org.iso.18013.5.1.mDL` (dual-format when Issuer offers both) |

Config source: `src/config/sameDeviceIssuance.ts`.

---

## 4. Issuer contract (deliverables)

| # | Requirement |
|---|-------------|
| I1 | Whitelist **`walletapp://callback`** as allowed `ReturnUrl` |
| I2 | Post-login redirect uses query param **`credential_offer_uri`** whose value is a **urlencoded HTTPS** Credential Offer endpoint — not a bare `openid-credential-offer://` redirect from the browser |
| I3 | `GET` on the offer URL returns **`application/json`** Credential Offer object |
| I4 | `documentType` values: **`IdCard`**, **`DriverLicense`**, **`Transcript`** |
| I5 | Offer **`grants`** match Issuer implementation (Wallet claim flow supports grants defined in the offer, typically pre-authorized code) |
| I6 | For DL/Transcript: complete PID verification **on Issuer web** before redirecting with the offer URI |
| I7 | Provide sample post-login redirect URLs (one per document type) for Wallet QA |

### Redirect example (copy-paste shape)

```text
walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3D<uuid>
```

Wallet also accepts query aliases: `offer_uri`, `uri`, `offer` (prefer `credential_offer_uri` for Issuer docs).

---

## 5. Wallet responsibilities

Already implemented; E2E verifies on device:

| # | Component |
|---|-----------|
| W1 | `walletapp` scheme in `app.json` (requires `npx expo prebuild` + native rebuild) |
| W2 | `openCredentialRequestPortal` — `WebBrowser.openAuthSessionAsync(portalUrl, returnUrl)` |
| W3 | `parseIssuanceCallbackUrl` — unwraps `walletapp://callback?credential_offer_uri=...` |
| W4 | Route to `/(tabs)/credential-offer` and existing OID4VCI claim |
| W5 | PID gates: `canRequestCredentialType`, `readPidGateStatus` |

### Preconditions (Wallet QA)

| # | Check |
|---|--------|
| P1 | Dev/production build with native `walletapp` registration |
| P2 | `EXPO_PUBLIC_ISSUER_LOGIN_URL` → Issuer `/Account/Login` |
| P3 | `EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL=walletapp://callback` (default) |
| P4 | Holder PIN setup and Ed25519 holder key ready |
| P5 | Issuer whitelisted `walletapp://callback` |

---

## 6. E2E acceptance matrix

Run on a **physical device** against Issuer staging/production.

| Doc | Wallet row | Portal `documentType` | Wallet preconditions | Pass criteria |
|-----|------------|----------------------|----------------------|---------------|
| ThaID | Thai National ID (no VC) | `IdCard` | No ThaID VC (or re-issue allowed) | Callback `walletapp://callback?credential_offer_uri=https://...`; claim succeeds; ThaID card on Home |
| Transcript | Transcript (no VC) | `Transcript` | Usable ThaID in wallet | Same callback shape; Transcript VC saved and rendered |
| Driving Licence | DL (no VC) | `DriverLicense` | Usable ThaID in wallet | Same callback shape; DL VC saved (per Issuer offer formats); DL card on Home |

### Negative cases (Wallet)

| Case | Expected |
|------|----------|
| Request Transcript/DL without usable ThaID | Portal blocked or PID dialog; no successful claim |
| Dismiss browser before redirect | “รอรับเอกสาร” dialog; optional **ไป Scan** |
| Issuer redirects with bare `openid-credential-offer://` | App chooser / missed session — **fail** until Issuer uses wrapped callback |
| Callback without offer query param | Dismissed; no claim screen (`issuer-portal-unrecognized-return` log) |

### Issuer joint verification

| # | Check |
|---|--------|
| J1 | Offer GET → 200 + valid Credential Offer JSON |
| J2 | Token endpoint accepts Wallet EdDSA PoP (`did:key` holder) |
| J3 | DL/Transcript: PID completed in browser before offer redirect |

### Sign-off artifacts

| Role | Deliverable |
|------|-------------|
| Wallet | Device test notes; log tags `issuer-portal-open`, `issuer-portal-return-offer`, claim steps (no PII) |
| Issuer | Three sample redirect URLs + offer JSON per document type |
| PM | All matrix rows + negative cases checked |

---

## 7. Error handling

| Failure | Wallet behavior | Owner |
|---------|-----------------|-------|
| Portal URL misconfigured | Misconfigured dialog | Wallet env |
| Browser session error | Error dialog | Device / network |
| Unrecognized callback | Dismissed | Issuer redirect shape |
| Offer GET / token / proof failure | Existing claim errors | Issuer + Wallet |
| Offer for non-PID doc without usable ThaID | PID gate dialog on claim | Holder / Issuer timing |

No new Wallet features required for this milestone unless E2E discovers a gap.

---

## 8. Remaining work

### Wallet

1. Native build: `npx expo prebuild` + dev client on target device
2. Execute E2E matrix (Section 6)
3. Optional cleanup: document or remove unused auth-code orchestrator code; align older spec filename

### Issuer (agreed / in progress)

1. Deploy `walletapp://callback?credential_offer_uri=...` redirect
2. Confirm grants and offer content per document type
3. Provide sample redirects for Wallet QA

### Documentation

1. This spec
2. `docs/TASKS.md` entry referencing E2E checklist
3. Implementation plan only if E2E finds Wallet gaps

---

## 9. Out of scope

- Cold-start `walletapp://` deeplink without `openAuthSessionAsync`
- Portal return via `openid4vp://` when Issuer handles VP in browser
- Wallet-managed OAuth `/authorize` + stored authorization code
- Automated CI E2E for portal login (manual device validation v1)
- Trust Registry, production Verifier `did:web`, NFC proximity

---

## 10. Verification strategy

**Approach:** Contract checklist + joint staging (recommended).

1. Wallet completes native build and unit tests (portal/callback — already passing).
2. Issuer deploys redirect contract.
3. Joint manual E2E on device for all three document types.
4. PM sign-off on matrix + negative cases.

Unit tests: `parseIssuanceCallbackUrl.test.ts`, `openCredentialRequestPortal.test.ts`, `buildIssuerLoginUrl.test.ts`, `credentialGuard.test.ts`.
