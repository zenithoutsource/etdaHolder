# Test mDOC Issuer

Standalone development issuer for Phase 2A of the NFC proximity work.

This service is intentionally separate from the Wallet Backend routes under `server/src/`. It exposes a small pre-authorized OID4VCI issuer for a sample `mso_mdoc` credential and keeps all state in memory.

## What it provides

- `POST /offers` to mint a new pre-authorized credential offer
- `GET /.well-known/openid-credential-issuer`
- `GET /.well-known/oauth-authorization-server`
- `POST /token`
- `POST /credential`

The credential endpoint returns a signed sample `mso_mdoc` credential as base64url CBOR bytes. The document uses:

- doctype: `org.iso.18013.5.1.mDL`
- configuration id: `TestMdocDrivingLicence`
- sample namespace: `org.iso.18013.5.1`

## Run

```powershell
Set-Location server
yarn mdoc-issuer:dev
```

Optional environment variables:

```env
MDOC_ISSUER_PORT=4100
MDOC_ISSUER_BASE_URL=http://127.0.0.1:4100
```

## Get a sample offer URI

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4100/offers -ContentType 'application/json' -Body '{"credentialConfigurationId":"TestMdocDrivingLicence"}'
```

The response includes:

- `offerUri`
- `preAuthorizedCode`
- `credentialOffer`

`offerUri` is the value to turn into a QR code or pass to future wallet claim tooling once `mso_mdoc` acquisition is wired into the mobile app.

## Verify

```powershell
Set-Location server
yarn test --runInBand mdoc-issuer/documentBuilder.test.ts mdoc-issuer/app.test.ts
yarn tsc
```
