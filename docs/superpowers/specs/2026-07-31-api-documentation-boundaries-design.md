# API Documentation Boundaries Design

**Date:** 2026-07-31
**Status:** Approved

## Problem

The server exposes three distinct API surfaces:

1. Wallet Backend operations under `/wallet-api/*`.
2. Verifier-owned presentation gateway operations under `/v1/*`.
3. Development simulation and diagnostic operations under `/dev/*` and
   `/wallet-api/dev/*`.

The existing Swagger UI documents only part of the Wallet Backend surface.
It does not provide complete developer-oriented descriptions and examples, it
does not document the presentation gateway, and it intentionally omits the
development APIs. This makes the complete server contract difficult for
external integrators and internal developers to discover.

Publishing every route in one document would also blur ownership and security
boundaries. In particular, development operations must not appear to be
production contracts or remain reachable in a production runtime.

## Audience

The documentation serves two audiences:

- External integrators consuming production Wallet Backend or Presentation
  Gateway contracts.
- Internal developers running development simulations, diagnostics, and
  lifecycle workflows.

## Decision

Create three documentation sets separated by trust and ownership boundary:

| API surface | Swagger UI | OpenAPI JSON | Availability |
|---|---|---|---|
| Wallet Backend | `/wallet-api/docs` | `/wallet-api/openapi.json` | All environments |
| Presentation Gateway | `/v1/docs` | `/v1/openapi.json` | All environments |
| Development APIs | `/dev/docs` | `/dev/openapi.json` | Non-production only |

The Development OpenAPI document covers both `/dev/*` and
`/wallet-api/dev/*`. The documentation location does not change the runtime
paths of the documented operations.

The existing Wallet Swagger paths remain stable. The implementation adds the
missing Wallet Provider attestation operation and improves operation summaries,
descriptions, constraints, responses, and synthetic examples.

## Production Development-Route Gate

Development documentation and the underlying development routers use the same
environment gate. When `NODE_ENV === "production"`:

- `/dev/*` is not mounted.
- `/wallet-api/dev/*` is not mounted.
- `/dev/docs` and `/dev/openapi.json` are not mounted.
- Requests to those paths return `404`.

Wallet Backend and Presentation Gateway routes remain available. The
Wallet Provider attestation handler remains documented as a development mock:
its current `alg: none` WUA/WIA output is not a production Wallet Provider
implementation and must not be described as one.

## OpenAPI Structure

OpenAPI source files remain under `server/src/openapi/`.

- The Wallet Backend document covers account registration, authentication,
  PIN reset, logout, wallet listing, credential import, push-token
  registration, and Wallet Provider attestation.
- The Presentation Gateway document covers presentation-session creation,
  presentation upload, status polling, and browser verification.
- The Development document covers issuer-key resolution, development VP
  sessions, suspension simulation, credential-use simulation, holder
  revocation, lifecycle webhooks, and credential renewal workflows.

Reusable Swagger installation logic serves each document without creating
three divergent middleware implementations. Documentation middleware is
installed before the corresponding API routers so `/docs` and
`/openapi.json` paths resolve predictably.

No new runtime dependency is required. The existing
`swagger-ui-express` dependency is reused.

## Human-Readable Guides

Create concise Markdown guides under `server/docs/`:

- Wallet Backend API guide.
- Presentation Gateway API guide.
- Development API guide.

`server/README.md` remains the documentation index and links to all three
guides and Swagger locations.

The guides explain boundaries, authentication, common workflows, configuration
expectations, and troubleshooting. Detailed request and response schemas stay
in OpenAPI rather than being duplicated throughout Markdown. This reduces
documentation drift.

No Postman collection is included in this slice.

## Documentation Content Rules

Every operation documents:

- HTTP method and full path.
- Purpose and ownership boundary.
- Authentication requirement.
- Path, query, header, and body parameters.
- Required fields, types, formats, enums, and validation constraints.
- Success status and response shape.
- Known error statuses and response shapes.
- Important response headers, including `Retry-After`.
- Synthetic request and response examples.

HTML verification responses are declared as `text/html`, not JSON.
No environment values, real tokens, credential claims, PII, secrets, private
keys, raw credentials, or production identifiers are copied into examples.

The Development guide clearly states that its operations are simulations and
diagnostics. The Wallet attestation documentation clearly states that unsigned
mock attestations are development-only.

## Primary Workflows

### Wallet Backend

1. Check whether an email account exists.
2. Register or log in with the Wallet PIN.
3. Use the returned JWT as a Bearer token.
4. List wallets owned by the authenticated account.
5. Import an already-finalized credential into an owned wallet.

Wallet Provider attestation is documented as a separate client boundary:
submit an Ed25519 public JWK and receive development WUA/WIA values plus their
expiry time.

### Presentation Gateway

1. Create a presentation session.
2. Display or share the returned verification URL.
3. Upload the Wallet presentation to the session.
4. Poll the session status.
5. Open the browser verification result.

The documentation includes pending, expired, consumed, conflict, and
verification-failure outcomes.

### Development APIs

The guide groups operations by workflow instead of presenting an unstructured
route list:

- Development Verifier sessions and issuer-key diagnostics.
- Issuer suspension simulation and acknowledgment state.
- Single-use credential state.
- Holder revocation nonce and proof flow.
- Credential lifecycle webhook and push notification simulation.
- Credential renewal request, VP response, readiness, and revocation state.

## Error Handling

OpenAPI responses reflect current behavior rather than inventing a normalized
error contract. Shared JSON errors use the existing `{ "message": string }`
shape where applicable.

The guides explain:

- Validation failures and required fields.
- Authentication and authorization failures.
- Rate limiting and retry behavior.
- Missing, expired, consumed, and conflicting presentation sessions.
- Upstream Issuer or notification failures in development workflows.
- The difference between JSON API errors and HTML browser-verification pages.

Documentation work does not silently change existing authentication or error
semantics. Any unsafe behavior discovered while documenting is reported
separately unless it is the approved production development-route gate.

## Verification

Focused tests verify:

- Each OpenAPI document uses OpenAPI 3.0.3 and contains its expected route and
  method inventory.
- Wallet and Presentation Gateway documents contain no development routes.
- Development operations appear only in the Development document.
- Swagger UI returns HTML and OpenAPI endpoints return JSON.
- Wallet Backend and Presentation Gateway documentation remains available in
  production.
- Development documentation and the two development route namespaces are
  available in test and development environments.
- Development documentation and underlying development routes return `404`
  when `NODE_ENV === "production"`.
- Bearer authentication, status codes, schemas, HTML media types, validation
  constraints, headers, and synthetic examples match the route behavior.

Run:

```powershell
Set-Location server
yarn tsc
yarn test
```

After the implementation slice, update `docs/TASKS.md` with the completed
documentation surfaces, route gate, and verification results.

## Non-Goals

- Changing production Wallet Backend or Presentation Gateway route paths.
- Replacing `swagger-ui-express`.
- Generating or publishing a Postman collection.
- Adding production Wallet Provider signing or trust policy.
- Redesigning API authentication or response envelopes.
- Turning development simulators into production services.
