# Portal Issuance — Issuer Handoff (Wallet ↔ Issuer)

Status: **Ready to send** (2026-07-22)
Wallet spec: `docs/superpowers/specs/2026-07-22-portal-issuance-e2e-design.md`

---

## Summary for Issuer team

After Holder login on `/Account/Login`, redirect the in-app browser session to the Wallet using **`walletapp://callback`** with the credential offer as an **HTTPS URL query parameter** — not a bare `openid-credential-offer://` redirect (that triggers multi-wallet app chooser on Android).

---

## Required redirect format

```text
walletapp://callback?credential_offer_uri=<urlencoded https offer endpoint>
```

### Example (Transcript)

```text
walletapp://callback?credential_offer_uri=https%3A%2F%2Fissuer.zenithcomp.co.th%3A455%2Fopenid4vc%2FcredentialOffer%3Fid%3D<uuid>
```

Decoded offer URL:

```text
https://issuer.zenithcomp.co.th:455/openid4vc/credentialOffer?id=<uuid>
```

---

## Portal entry (Wallet opens)

```text
https://issuer.zenithcomp.co.th:455/Account/Login?
  ReturnUrl=walletapp%3A%2F%2Fcallback
  &documentType=IdCard|DriverLicense|Transcript
```

| Wallet document | Issuer `documentType` |
|-----------------|----------------------|
| Thai National ID | `IdCard` |
| Driving Licence | `DriverLicense` |
| Transcript | `Transcript` |

---

## Issuer checklist

| # | Requirement | Status |
|---|-------------|--------|
| I1 | Whitelist `walletapp://callback` as allowed `ReturnUrl` | ☐ |
| I2 | Redirect uses `credential_offer_uri` with **HTTPS** value (not nested `openid-credential-offer://`) | ☐ |
| I3 | `GET` on offer URL returns `application/json` Credential Offer | ☐ |
| I4 | `documentType` values match table above | ☐ |
| I5 | Offer `grants` match Issuer token flow (Wallet supports grants in offer) | ☐ |
| I6 | DL/Transcript: PID verification completed **in Issuer web** before offer redirect | ☐ |
| I7 | Provide one sample post-login redirect URL per document type for Wallet QA | ☐ |

---

## Sample URLs requested from Issuer

Please reply with three real post-login redirect URLs (redact secrets if needed):

1. **IdCard** — `walletapp://callback?credential_offer_uri=...`
2. **Transcript** — `walletapp://callback?credential_offer_uri=...`
3. **DriverLicense** — `walletapp://callback?credential_offer_uri=...`

---

## What Wallet does after redirect

1. Parses `credential_offer_uri` from callback query
2. `GET` offer JSON from HTTPS URL (OID4VCI standard)
3. Token + proof + credential request (existing OID4VCI 1.0 flow)
4. Saves VC to encrypted wallet storage

Wallet does **not** expect `openid4vp://` on this portal path when PID is handled on Issuer web.

---

## Contact / QA

Wallet E2E plan: `docs/superpowers/plans/2026-07-22-portal-issuance-e2e.md`
