# Same-Device Issuance via Issuer Login Portal

Status: **Approved** (2026-07-22) · **Wallet uses offer URI callback** · **authorization_code path not used**

## Goal

Same-device Standard VC issuance via Issuer login portal:

1. Wallet opens **`/Account/Login?ReturnUrl=walletapp://callback&documentType=...`**
2. Holder logs in on Issuer web
3. Issuer redirects to Wallet with **credential offer URI** (not OAuth `code`)
4. Existing OID4VCI claim flow (`credential-offer` screen → pre-auth or auth-code inside offer as Issuer defines)

## Portal URL (locked)

```text
https://issuer.zenithcomp.co.th:455/Account/Login?
  ReturnUrl=walletapp%3A%2F%2Fcallback
  &documentType=Transcript|DriverLicense|IdCard
```

## Callback (locked contract)

Issuer returns an **issuance URI** on `walletapp://callback`, e.g.:

| Form | Example |
|------|---------|
| Direct deeplink | `openid-credential-offer://?credential_offer_uri=...` |
| Query on callback | `walletapp://callback?credential_offer_uri=https%3A%2F%2F...` |
| Query alias | `walletapp://callback?uri=...` |

Wallet normalizes https/offer query values into `openid-credential-offer://` and routes to **`/(tabs)/credential-offer`**.

Optional: Issuer may return **`openid4vp://`** on callback → Wallet routes to **Scan** for PID VP.

## Not used on this path

- Wallet-initiated `/authorize` + PKCE + stored OAuth `code`
- `sameDeviceIssuance` orchestrator for token exchange (code remains in `exchangeService` for future use only)

## Verification

- Unit: login URL builder, callback URI parse, portal open
- Manual: Home ขอเอกสาร → login → offer URI → claim
