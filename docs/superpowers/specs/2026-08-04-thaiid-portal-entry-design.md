# ThaID Portal Entry — Design Spec

Status: **Approved** (2026-08-04)
Scope: Same-device issuance when Issuer portal uses ThaID login instead of `/Account/Login`

Related:

- `docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md`
- `docs/superpowers/specs/2026-06-29-issuer-portal-request-design.md`

---

## 1. Goal

Holder taps **ขอเอกสาร** on Wallet Home → in-app browser opens Issuer **ThaID login** portal → Holder completes ThaID → Issuer redirects **`walletapp://callback?credential_offer_uri=...`** → existing OID4VCI claim flow.

Issuer removed its own login page; identity verification runs through ThaID on the portal side. Wallet does **not** integrate ThaID OAuth or show a simulated ThaID interstitial.

---

## 2. Locked decisions

| Topic | Decision |
|-------|----------|
| Portal entry | `https://issuer.zenithcomp.co.th:455/thaiid/login?ReturnUrl=walletapp://callback&documentType=...` |
| `ReturnUrl` on entry | Still `walletapp://callback` — Issuer completes ThaID + issuance before final wallet redirect |
| Wallet callback contract | Unchanged: `credential_offer_uri` HTTPS offer URL (aliases still supported) |
| ThaID mock UI | Removed — IdCard offers acquire immediately after resolve |
| PID bootstrap | **ขอ ThaID** PID gate opens portal with `ThaiNationalID` / `documentType=IdCard` |
| VP portal callback | Route to `/(tabs)/presentation-request` (not Scan) |

### documentType mapping

Unchanged — see `src/config/sameDeviceIssuance.ts`.

| Wallet type | Issuer `documentType` |
|-------------|----------------------|
| `ThaiNationalID` | `IdCard` |
| `DLTDrivingLicence` | `DriverLicense` |
| `ChulalongkornUniversityTranscript` | `Transcript` |

---

## 3. End-to-end flow

```
Wallet Home — ขอเอกสาร
  │
  ▼
openAuthSessionAsync(
  https://issuer.zenithcomp.co.th:455/thaiid/login
    ?ReturnUrl=walletapp://callback
    &documentType=IdCard | DriverLicense | Transcript
)
  │
  │ ThaID login + Issuer processing (browser)
  ▼
walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer...%2Foffer...
  │
  ▼
/(tabs)/credential-offer → resolveOffer → acquire → save
```

---

## 4. Wallet changes

| Component | Change |
|-----------|--------|
| `sameDeviceIssuance.ts` | Default `EXPO_PUBLIC_ISSUER_LOGIN_URL` → `/thaiid/login` |
| `buildIssuerLoginUrl.ts` | No logic change |
| `app/(tabs)/index.tsx` | PID gate **ขอ ThaID** → `requestCredentialViaPortalFlow('ThaiNationalID')` |
| `requestCredentialViaPortalFlow.ts` | `presentation_request` → `/(tabs)/presentation-request` |
| `CredentialOfferClaimScreen` | No `thaIdVerify` mock phase |

Env:

- `EXPO_PUBLIC_ISSUER_LOGIN_URL` — portal entry (default `/thaiid/login`)
- `EXPO_PUBLIC_ISSUER_WALLET_RETURN_URL` — `walletapp://callback` (unchanged)

---

## 5. Testing

| Layer | Check |
|-------|--------|
| Unit | `buildIssuerLoginUrl.test.ts`, `openCredentialRequestPortal.test.ts`, `requestCredentialViaPortalFlow.test.ts` |
| Device E2E | IdCard via portal → ThaID → callback → VC on Home |
| Device E2E | DL/Transcript with usable PID → same callback shape |

---

## 6. Out of scope

- ThaID native app OAuth in Wallet
- Issuer portal ThaID session storage
- Changing OID4VCI claim protocol
