# Development API

> Development APIs are mounted when `NODE_ENV !== "production"`, or when
> `ENABLE_DEVELOPMENT_APIS=true`. They simulate Issuer, Verifier, lifecycle, and
> notification behavior and must never be treated as production services.

Interactive documentation:

- Swagger UI: `/wallet-api/dev/docs` (local alias `/dev/docs`)
- OpenAPI JSON: `/wallet-api/dev/openapi.json` (local alias `/dev/openapi.json`)

When development APIs are enabled, `/wallet-api/docs` also lists these operations.

`/wallet-api/dev/*` and `/dev/*` return `404` when `NODE_ENV === "production"` and
`ENABLE_DEVELOPMENT_APIS` is not `true`/`1`. Shared HTTPS hosts that only forward
`/wallet-api/*` must use the `/wallet-api/dev/...` paths.

**Never paste production VC, VP, JWT, token, DID, key, or PII values into development examples or Swagger.**

## 1. Issuer-key diagnostics

Issuer `did:key` public keys for SD-JWT verification helpers are resolved through the customer
Issuer API `GET /resolveDID?didKey=...` (see Issuer Swagger). Configure
`ISSUER_BASE_URL` on the wallet server, or pass `--issuer` to the CLI below.

```bash
# Issuer utility (production Issuer host)
curl -sS "https://issuer.zenithcomp.co.th:455/resolveDID?didKey=did:key:zSyntheticIssuer"

# Local helper: derive VP_ISSUER_PUBLIC_KEY_JWK from a raw VC JWT header kid
cd server && yarn resolve-vp-issuer-key --raw-vc "synthetic.jwt.vc" --issuer https://issuer.zenithcomp.co.th:455
```

## 2. Suspension and single-use state

| Operation | Purpose |
|---|---|
| `POST /wallet-api/dev/presentation/suspend-access` | Record presentation access suspension (`eventId`, `credentialId`, `partyName`) |
| `POST /wallet-api/dev/issuer/suspend` | Simulate issuer suspension metadata |
| `GET /wallet-api/dev/wallet/suspension-status` | List suspension records |
| `POST /wallet-api/dev/wallet/mark-used` | Mark credential as used |
| `GET /wallet-api/dev/wallet/used-status?credentialId=...` | Query used flag |

## 3. Holder revocation nonce and PoP

1. `POST /wallet-api/dev/issuer/holder-revoke/nonce` — issue nonce and audience for PoP.
2. `POST /wallet-api/dev/issuer/holder-revoke` — submit `credentialId`, `holderDid`, and `popJwt`.
   PoP `alg` is `EdDSA` for Ed25519 `did:key` or `ES256` for P-256 `did:key`.
3. `GET /wallet-api/dev/wallet/revoke-status?credentialId=...` — query `none` or `revoked`.

Use only synthetic DIDs and PoP JWTs such as `did:key:zSyntheticHolder` and `synthetic.pop.jwt`.

## 4. Push-event simulation

`POST /wallet-api/dev/webhook/credential-event` delivers Expo push notifications when a push token was registered for the Holder DID.

Supported `event` values: `renewal-ready`, `renewal-required`, `issuer-suspended`, `cleanup-pending`, `old-revoked`.

```bash
curl -sS -X POST "http://localhost:4000/wallet-api/dev/webhook/credential-event" \
  -H "Content-Type: application/json" \
  -d '{"event":"renewal-ready","holderDid":"did:key:zSyntheticHolder","credentialId":"credential-synthetic-1","credentialType":"ThaiNationalID"}'
```

## 5. Credential renewal

| Step | Endpoint |
|---|---|
| Start renewal | `POST /wallet-api/dev/wallet/renewal-request` |
| Submit renewal VP | `POST /wallet-api/dev/wallet/renewal-vp/response` (JSON or form `vp_token`, `state`) |
| Poll readiness | `GET /wallet-api/dev/wallet/renewal-status` |

Renewal `state` values: `requested`, `offer-ready`, `revoked`. After VP acceptance, offer readiness may depend on `DEV_RENEWAL_DELAY_MS`.

## Field reference

See `/wallet-api/dev/openapi.json` for the complete operation inventory and request schemas.
