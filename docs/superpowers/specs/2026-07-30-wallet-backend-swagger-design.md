# Wallet Backend Swagger Design

## Status

Approved for implementation on 2026-07-30.

## Context

The public host already serves Broker documentation at
`https://wallet.zenithcomp.co.th:455/swagger/index.html`. The Node Wallet
backend shares that host but is a separate service behind the `/wallet-api/*`
path boundary. Operators need a browser-based way to inspect and exercise the
Wallet API without copying shell commands.

The server already depends on `swagger-ui-express`, but it does not mount a
Swagger UI or publish an OpenAPI document.

## Decisions

- Keep Broker Swagger unchanged at `/swagger/index.html`.
- Publish Wallet Swagger UI at `/wallet-api/docs`.
- Publish the raw Wallet OpenAPI document at `/wallet-api/openapi.json`.
- Make both Wallet documentation routes public, matching the current Broker
  documentation posture.
- Do not add Swagger-specific enablement, username, or password environment
  variables.
- Document only the normal Wallet API surface.
- Exclude `/wallet-api/dev/*` and `/dev/*`.
- Include an HTTP Bearer security scheme and Swagger **Authorize** support for
  Wallet session JWTs.
- Use synthetic examples only. Never include real tokens, credentials, DIDs,
  claims, cryptographic material, or PII.

## Approaches Considered

### 1. Central OpenAPI document

Maintain an explicit OpenAPI 3 document in a focused server module and serve it
through the existing `swagger-ui-express` dependency.

This is the selected approach. It adds no dependency, keeps route handlers
focused, and makes the documented public surface easy to review.

### 2. Route-level JSDoc annotations

Annotate handlers and generate the document with `swagger-jsdoc`.

Rejected because it adds a dependency and mixes large documentation blocks into
route implementation files.

### 3. Schema-generated OpenAPI

Generate OpenAPI from shared runtime validation schemas.

Rejected for this slice because the server does not yet have a shared
schema-first validation layer. Introducing one would turn a documentation task
into a broader API refactor.

## Architecture

Add two focused modules:

- `server/src/openapi/walletOpenApi.ts` owns the OpenAPI 3 document, component
  schemas, examples, tags, response descriptions, and Bearer security scheme.
- `server/src/openapi/installWalletSwagger.ts` mounts the JSON document and
  Swagger UI on the Express application.

`server/src/testApp.ts` installs the documentation routes without changing the
existing API router boundaries.

The OpenAPI `servers` configuration uses the current origin rather than a
hardcoded hostname. Swagger **Try it out** therefore calls the same public
origin from which the UI was loaded, including port `455`.

## Documented API Surface

The initial document covers every normal route currently mounted beneath
`/wallet-api/auth` and `/wallet-api/wallet`:

### Authentication

- `POST /wallet-api/auth/email-status`
- `POST /wallet-api/auth/register`
- `POST /wallet-api/auth/login`
- `POST /wallet-api/auth/pin-reset/request`
- `POST /wallet-api/auth/pin-reset/verify`
- `POST /wallet-api/auth/pin-reset/confirm`
- `POST /wallet-api/auth/logout`

### Wallets

- `GET /wallet-api/wallet/accounts/wallets`

### Credentials

- `POST /wallet-api/wallet/{wallet}/credentials/import`

### Push notifications

- `POST /wallet-api/wallet/push-token`

The specification must match the implemented request names, required fields,
status codes, and authentication requirements. It must not invent endpoints or
broaden the server contract.

## Request Flow

```text
Browser
  -> https://wallet.zenithcomp.co.th:455/wallet-api/docs
  -> existing HTTPS reverse proxy
  -> Node Wallet backend on port 4000
  -> Swagger UI
  -> Try it out
  -> normal /wallet-api/* route on the same origin
```

The reverse proxy must preserve the complete `/wallet-api/*` request path. The
Wallet Swagger change does not modify Broker routing or Broker Swagger.

## Authentication and Security

The documentation routes themselves are public. This is an explicit
convenience tradeoff: anyone who can reach the host can discover the documented
normal Wallet API surface.

Endpoint security does not change:

- Operations that currently require a Wallet session JWT remain protected by
  the existing Bearer middleware.
- Swagger exposes an `http`/`bearer` security scheme so an operator can paste a
  JWT into **Authorize**.
- Public operations remain public.
- Development-only routes are absent from the document.
- Examples use unmistakably synthetic identifiers and payloads.
- The OpenAPI document contains no secrets or deployment credentials.

## Error Documentation

Document only response statuses supported by the current handlers and tests:

- `400` for invalid input.
- `401` for missing or invalid Wallet authentication where applicable.
- `403` for ownership violations where applicable.
- `404` for missing resources where applicable.
- `409` for conflicts where applicable.
- Success statuses exactly as implemented by each route.

Swagger installation must not replace the existing Express error handler or
change unknown-route behavior.

## Verification

Add focused server tests proving:

1. `GET /wallet-api/docs/` returns Swagger HTML.
2. `GET /wallet-api/openapi.json` returns a valid OpenAPI document.
3. The document includes `/wallet-api/wallet/push-token`.
4. The document includes all normal Auth, Wallet, Credential, and Push routes.
5. The document excludes `/wallet-api/dev/*` and `/dev/*`.
6. JWT-protected operations reference the Bearer security scheme.
7. Existing server tests still pass.

Run:

```powershell
Set-Location server
yarn tsc
yarn test
```

## Documentation Updates

- Update `server/README.md` with both Wallet Swagger URLs, the public-access
  posture, and the reverse-proxy path-preservation requirement.
- Update `docs/TASKS.md` after the implementation slice is complete.
