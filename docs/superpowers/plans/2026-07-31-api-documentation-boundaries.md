# API Documentation Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish separate, developer-friendly Wallet Backend, Presentation Gateway, and non-production Development API documentation while making development routes unreachable in production.

**Architecture:** Keep three independent OpenAPI 3.0.3 documents aligned to the server's trust boundaries. Reuse one Swagger mounting helper, keep the existing Wallet documentation URLs stable, and use one shared environment policy for both development documentation and development routers. Keep detailed field contracts in OpenAPI and add concise Markdown workflow guides under `server/docs/`.

**Tech Stack:** TypeScript 5.9, Express 4, `swagger-ui-express`, Jest 29, Supertest, Markdown

## Global Constraints

- Follow `docs/superpowers/specs/2026-07-31-api-documentation-boundaries-design.md`.
- Do not add the customer organization name to identifiers, files, comments, examples, or documentation.
- Preserve `/wallet-api/docs` and `/wallet-api/openapi.json`.
- Publish `/v1/docs` and `/v1/openapi.json` in every environment.
- Publish `/dev/docs` and `/dev/openapi.json` only when `NODE_ENV !== "production"`.
- Mount neither `/dev/*` nor `/wallet-api/dev/*` when `NODE_ENV === "production"`.
- Do not change existing Wallet Backend or Presentation Gateway runtime paths or response semantics.
- Use only synthetic examples. Never include real tokens, credentials, claims, DIDs, email addresses, PII, secrets, private keys, or environment values.
- Clearly label the current unsigned Wallet attestation response and every Development API as non-production behavior.
- Reuse the installed `swagger-ui-express`; add no dependency and no Postman collection.
- Preserve unrelated working-tree changes, especially current edits in `server/src/testApp.ts`, `docs/API.md`, and `docs/TASKS.md`.
- After the implementation slice, update `docs/TASKS.md`.
- Run server verification with `yarn tsc` and `yarn test`.

---

### Task 1: Share the Swagger mounting infrastructure

**Files:**

- Create: `server/src/openapi/openApiHelpers.ts`
- Create: `server/src/openapi/installSwaggerDocument.ts`
- Create: `server/src/openapi/installSwaggerDocument.test.ts`
- Modify: `server/src/openapi/walletOpenApi.ts`
- Modify: `server/src/openapi/installWalletSwagger.ts`
- Test: `server/src/openapi/installWalletSwagger.test.ts`

**Interfaces:**

- Produces:
  - `schemaRef(name: string): { $ref: string }`
  - `jsonContent(schema: Record<string, unknown>): { content: { 'application/json': { schema: Record<string, unknown> } } }`
  - `responseRef(name: string): { $ref: string }`
  - `errorResponseSchema`
  - `createErrorResponse(description: string)`
  - `installSwaggerDocument(app: Express, options: SwaggerDocumentOptions): void`
  - `SwaggerDocumentOptions = { docsPath: string; openApiPath: string; document: Record<string, unknown>; title: string }`
- Consumed later by all three OpenAPI documents and installers.

- [ ] **Step 1: Write the failing generic installer test**

Create `installSwaggerDocument.test.ts` with a minimal Express app and synthetic document:

```ts
import express from 'express'
import request from 'supertest'

import { installSwaggerDocument } from './installSwaggerDocument'

const document = {
  openapi: '3.0.3',
  info: { title: 'Synthetic API', version: '1.0.0' },
  paths: {},
}

test('serves one OpenAPI document and its Swagger UI', async () => {
  const app = express()
  installSwaggerDocument(app, {
    docsPath: '/synthetic/docs',
    openApiPath: '/synthetic/openapi.json',
    document,
    title: 'Synthetic API',
  })

  const json = await request(app).get('/synthetic/openapi.json')
  expect(json.status).toBe(200)
  expect(json.type).toBe('application/json')
  expect(json.body).toEqual(document)

  const html = await request(app).get('/synthetic/docs/')
  expect(html.status).toBe(200)
  expect(html.type).toBe('text/html')
  expect(html.text).toContain('<title>Synthetic API</title>')
  expect(html.text).toContain('id="swagger-ui"')
})
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
Set-Location server
yarn test src/openapi/installSwaggerDocument.test.ts --runInBand
```

Expected: FAIL because `installSwaggerDocument.ts` does not exist.

- [ ] **Step 3: Implement the shared OpenAPI helpers**

Move the three existing local helpers from `walletOpenApi.ts` into
`openApiHelpers.ts` and add the common error schema/response factory:

```ts
export const jsonContent = (schema: Record<string, unknown>) => ({
  content: {
    'application/json': { schema },
  },
})

export const schemaRef = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
})

export const responseRef = (name: string) => ({
  $ref: `#/components/responses/${name}`,
})

export const errorResponseSchema = {
  type: 'object',
  required: ['message'],
  properties: {
    message: { type: 'string', example: 'Bad Request' },
  },
} as const

export const createErrorResponse = (description: string) => ({
  description,
  ...jsonContent(schemaRef('ErrorResponse')),
})
```

Update `walletOpenApi.ts` to import these helpers and preserve its exported
`walletOpenApiDocument` shape.

- [ ] **Step 4: Implement the shared Swagger installer**

Create `installSwaggerDocument.ts`:

```ts
import type { Express, RequestHandler } from 'express'
import swaggerUi from 'swagger-ui-express'

export type SwaggerDocumentOptions = {
  docsPath: string
  openApiPath: string
  document: Record<string, unknown>
  title: string
}

const swaggerUiServe = swaggerUi.serve as unknown as RequestHandler[]

export function installSwaggerDocument(
  app: Express,
  options: SwaggerDocumentOptions,
): void {
  app.get(options.openApiPath, (_req, res) => {
    res.status(200).json(options.document)
  })

  const page = swaggerUi.setup(options.document, {
    customSiteTitle: options.title,
  }) as unknown as RequestHandler

  app.use(options.docsPath, ...swaggerUiServe, page)
}
```

Refactor `installWalletSwagger.ts` to be a thin adapter:

```ts
import type { Express } from 'express'

import { installSwaggerDocument } from './installSwaggerDocument'
import { walletOpenApiDocument } from './walletOpenApi'

export function installWalletSwagger(app: Express): void {
  installSwaggerDocument(app, {
    docsPath: '/wallet-api/docs',
    openApiPath: '/wallet-api/openapi.json',
    document: walletOpenApiDocument,
    title: 'Wallet Backend API',
  })
}
```

- [ ] **Step 5: Run installer and Wallet regression tests**

Run:

```powershell
yarn test src/openapi/installSwaggerDocument.test.ts src/openapi/installWalletSwagger.test.ts src/openapi/walletOpenApi.test.ts --runInBand
```

Expected: PASS with the existing Wallet documentation paths and behavior
unchanged.

- [ ] **Step 6: Commit**

```powershell
git add server/src/openapi/openApiHelpers.ts server/src/openapi/installSwaggerDocument.ts server/src/openapi/installSwaggerDocument.test.ts server/src/openapi/walletOpenApi.ts server/src/openapi/installWalletSwagger.ts server/src/openapi/installWalletSwagger.test.ts
git commit -m "refactor(server): share Swagger installer"
```

---

### Task 2: Complete the Wallet Backend OpenAPI contract

**Files:**

- Modify: `server/src/openapi/walletOpenApi.ts`
- Modify: `server/src/openapi/walletOpenApi.test.ts`
- Modify: `server/src/openapi/installWalletSwagger.test.ts`

**Interfaces:**

- Consumes: shared OpenAPI helpers from Task 1.
- Produces: `walletOpenApiDocument` with exactly eleven public paths.
- No runtime route changes.

The exact operation inventory is:

| Method | Path | Summary |
|---|---|---|
| POST | `/wallet-api/auth/email-status` | Check whether a Wallet Account exists |
| POST | `/wallet-api/auth/register` | Register a Wallet Account |
| POST | `/wallet-api/auth/login` | Log in to a Wallet Account |
| POST | `/wallet-api/auth/pin-reset/request` | Request a PIN-reset OTP |
| POST | `/wallet-api/auth/pin-reset/verify` | Verify a PIN-reset OTP |
| POST | `/wallet-api/auth/pin-reset/confirm` | Set a new Wallet PIN |
| POST | `/wallet-api/auth/logout` | Log out the current session |
| GET | `/wallet-api/wallet/accounts/wallets` | List wallets for the authenticated account |
| POST | `/wallet-api/wallet/{wallet}/credentials/import` | Import a finalized credential |
| POST | `/wallet-api/wallet/push-token` | Register an Expo push token |
| POST | `/wallet-api/wallet-attestations` | Issue development Wallet attestations |

- [ ] **Step 1: Extend the failing Wallet contract tests**

Add `/wallet-api/wallet-attestations` to `expectedPaths` and assert:

```ts
expect(paths()['/wallet-api/wallet-attestations'].post).toMatchObject({
  summary: 'Issue development Wallet attestations',
  responses: {
    201: expect.any(Object),
    400: expect.any(Object),
  },
})

expect(
  JSON.stringify(paths()['/wallet-api/wallet-attestations']),
).toContain('development')
expect(
  JSON.stringify(paths()['/wallet-api/wallet-attestations']),
).toContain('alg: none')
```

Also add a table-driven assertion that every operation has a non-empty
`summary` and `description`, and verify these route-specific constraints:

```ts
expect(
  walletOpenApiDocument.components.schemas.RegisterRequest.properties.pin,
).toMatchObject({ type: 'string', pattern: '^\\d{6}$' })
expect(
  walletOpenApiDocument.components.schemas.WalletAttestationJwk,
).toMatchObject({
  required: ['kty', 'crv', 'x'],
})
```

- [ ] **Step 2: Run the Wallet OpenAPI test and confirm it fails**

Run:

```powershell
yarn test src/openapi/walletOpenApi.test.ts --runInBand
```

Expected: FAIL because the attestation path and operation descriptions are
missing.

- [ ] **Step 3: Add summaries, descriptions, and safe examples**

For each operation in the inventory table, set its exact `summary` and add a
description that states purpose, authentication, and important behavior. Keep
Bearer security only on wallet listing and credential import because that is
the current runtime behavior.

Use synthetic examples:

```ts
const examples = {
  email: 'developer@example.invalid',
  pin: '593817',
  accountId: '11111111-1111-4111-8111-111111111111',
  walletId: '22222222-2222-4222-8222-222222222222',
  holderDid: 'did:key:zSyntheticHolder',
  credentialJwt: 'synthetic.jwt.vc',
  sessionJwt: 'synthetic.jwt.value',
} as const
```

Do not describe push-token registration as authenticated because the current
route does not enforce authentication.

- [ ] **Step 4: Add the Wallet attestation schemas and operation**

Add these schemas:

```ts
WalletAttestationJwk: {
  type: 'object',
  required: ['kty', 'crv', 'x'],
  properties: {
    kty: { type: 'string', enum: ['OKP'] },
    crv: { type: 'string', enum: ['Ed25519'] },
    x: { type: 'string', example: 'SyntheticEd25519PublicKey' },
  },
},
WalletAttestationRequest: {
  type: 'object',
  required: ['pubKAttestJwk'],
  properties: {
    pubKAttestJwk: schemaRef('WalletAttestationJwk'),
  },
},
WalletAttestationResponse: {
  type: 'object',
  required: ['wua', 'wia', 'expiresAt'],
  properties: {
    wua: { type: 'string', example: 'synthetic.wua.' },
    wia: { type: 'string', example: 'synthetic.wia.' },
    expiresAt: { type: 'string', format: 'date-time' },
  },
},
```

Add `POST /wallet-api/wallet-attestations` with:

- No Bearer security declaration.
- Required JSON `WalletAttestationRequest`.
- `201` JSON `WalletAttestationResponse`.
- `400` shared error response.
- A description stating that the current handler returns unsigned
  `alg: none` development mocks and is not production-ready.

- [ ] **Step 5: Verify the served Wallet document**

Update `installWalletSwagger.test.ts` to assert the served JSON contains the
attestation path and excludes `/v1`, `/dev`, and `/wallet-api/dev` paths.

Run:

```powershell
yarn test src/openapi/walletOpenApi.test.ts src/openapi/installWalletSwagger.test.ts src/routes/walletProviderAttest.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add server/src/openapi/walletOpenApi.ts server/src/openapi/walletOpenApi.test.ts server/src/openapi/installWalletSwagger.test.ts
git commit -m "docs(server): complete Wallet OpenAPI"
```

---

### Task 3: Publish the Presentation Gateway documentation

**Files:**

- Create: `server/src/openapi/presentationGatewayOpenApi.ts`
- Create: `server/src/openapi/presentationGatewayOpenApi.test.ts`
- Create: `server/src/openapi/installPresentationGatewaySwagger.ts`
- Create: `server/src/openapi/installPresentationGatewaySwagger.test.ts`
- Modify: `server/src/testApp.ts`

**Interfaces:**

- Consumes: `installSwaggerDocument`, `schemaRef`, `jsonContent`,
  `responseRef`, `errorResponseSchema`, and `createErrorResponse`.
- Produces:
  - `presentationGatewayOpenApiDocument`
  - `installPresentationGatewaySwagger(app: Express): void`
- Mounts documentation only; existing `/v1/*` handlers remain unchanged.

The exact operation and response inventory is:

| Method | Path | Responses |
|---|---|---|
| POST | `/v1/presentation-sessions` | 201 |
| PUT | `/v1/presentation-sessions/{sessionId}` | 200, 400, 404, 409, 410 |
| GET | `/v1/presentation-sessions/{sessionId}/status` | 200, 404 |
| GET | `/v1/present/verify` | 200, 202, 404, 409, 410 |

- [ ] **Step 1: Write the failing Presentation Gateway document test**

Create `presentationGatewayOpenApi.test.ts`:

```ts
import { presentationGatewayOpenApiDocument } from './presentationGatewayOpenApi'

const expectedPaths = [
  '/v1/presentation-sessions',
  '/v1/presentation-sessions/{sessionId}',
  '/v1/presentation-sessions/{sessionId}/status',
  '/v1/present/verify',
]

test('documents only the Presentation Gateway surface', () => {
  expect(presentationGatewayOpenApiDocument.openapi).toBe('3.0.3')
  expect(Object.keys(presentationGatewayOpenApiDocument.paths).sort())
    .toEqual([...expectedPaths].sort())
  expect(
    Object.keys(presentationGatewayOpenApiDocument.paths)
      .some((path) => path.startsWith('/dev') || path.startsWith('/wallet-api')),
  ).toBe(false)
})

test('documents browser verification as HTML with retry metadata', () => {
  const operation =
    presentationGatewayOpenApiDocument.paths['/v1/present/verify'].get
  expect(operation.parameters).toContainEqual(
    expect.objectContaining({ name: 's', in: 'query', required: true }),
  )
  expect(operation.responses[202]).toMatchObject({
    headers: {
      'Retry-After': expect.any(Object),
    },
    content: {
      'text/html': expect.any(Object),
    },
  })
})
```

- [ ] **Step 2: Run the document test and confirm it fails**

Run:

```powershell
yarn test src/openapi/presentationGatewayOpenApi.test.ts --runInBand
```

Expected: FAIL because the document does not exist.

- [ ] **Step 3: Implement the Presentation Gateway OpenAPI document**

Use:

```ts
info: {
  title: 'Presentation Gateway API',
  version: '1.0.0',
  description:
    'Verifier-owned session API for receiving and verifying Wallet presentations.',
},
servers: [{ url: '/' }],
tags: [
  { name: 'Presentation sessions' },
  { name: 'Browser verification' },
],
```

Define these schemas exactly:

- `PresentationSession`: required `sessionId`, `nonce`, `expiresAt`,
  `verifyUrl`; UUID/date-time/URI formats where applicable.
- `PresentationUploadRequest`: required string `vpToken` and
  `credentialType`; document that the v1 gateway currently accepts
  `ThaiNationalID`.
- `PresentationUploadResponse`: required `ok`, enum `[true]`.
- `PresentationStatusResponse`: required `status`, `expiresAt`; status enum
  `pending`, `ready`, `verified`, `verify_failed`, `expired`; optional
  `reason`.
- `ErrorResponse`: shared error schema.

Document `sessionId` as a required path parameter and `s` as a required query
parameter. For `/v1/present/verify`, declare `text/html` for all responses,
and declare:

```ts
202: {
  description: 'Presentation has not been uploaded yet',
  headers: {
    'Retry-After': {
      description: 'Seconds before retrying',
      schema: { type: 'integer', example: 2 },
    },
  },
  content: {
    'text/html': {
      schema: { type: 'string' },
      example: '<!doctype html><html><body>Presentation pending</body></html>',
    },
  },
},
```

No Bearer security scheme is declared because these routes do not currently
enforce Wallet Account authentication.

- [ ] **Step 4: Add and test the Presentation Swagger installer**

Create `installPresentationGatewaySwagger.ts`:

```ts
import type { Express } from 'express'

import { installSwaggerDocument } from './installSwaggerDocument'
import { presentationGatewayOpenApiDocument } from './presentationGatewayOpenApi'

export function installPresentationGatewaySwagger(app: Express): void {
  installSwaggerDocument(app, {
    docsPath: '/v1/docs',
    openApiPath: '/v1/openapi.json',
    document: presentationGatewayOpenApiDocument,
    title: 'Presentation Gateway API',
  })
}
```

Create an integration test parallel to `installWalletSwagger.test.ts` that
asserts `/v1/docs/` returns Swagger HTML and `/v1/openapi.json` returns the
four-path document without Wallet or Development paths.

- [ ] **Step 5: Install the public Presentation documentation**

In `createTestApp()`, call `installPresentationGatewaySwagger(app)`
immediately after `installWalletSwagger(app)` and before CORS or API routers:

```ts
installWalletSwagger(app)
installPresentationGatewaySwagger(app)
app.use(createCorsMiddleware())
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
yarn test src/openapi/presentationGatewayOpenApi.test.ts src/openapi/installPresentationGatewaySwagger.test.ts src/routes/presentationGateway.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add server/src/openapi/presentationGatewayOpenApi.ts server/src/openapi/presentationGatewayOpenApi.test.ts server/src/openapi/installPresentationGatewaySwagger.ts server/src/openapi/installPresentationGatewaySwagger.test.ts server/src/testApp.ts
git commit -m "docs(server): document presentation gateway"
```

---

### Task 4: Disable development APIs in production

**Files:**

- Create: `server/src/developmentApiPolicy.ts`
- Create: `server/src/developmentApiPolicy.test.ts`
- Modify: `server/src/testApp.ts`
- Modify: `server/src/testApp.test.ts`

**Interfaces:**

- Produces:
  - `areDevelopmentApisEnabled(nodeEnv?: string): boolean`
- Consumed in Task 5 by the Development Swagger installer gate.

- [ ] **Step 1: Write the failing pure policy test**

Create `developmentApiPolicy.test.ts`:

```ts
import { areDevelopmentApisEnabled } from './developmentApiPolicy'

test.each([
  ['production', false],
  ['development', true],
  ['test', true],
  [undefined, true],
] as const)('NODE_ENV=%s enables development APIs: %s', (nodeEnv, expected) => {
  expect(areDevelopmentApisEnabled(nodeEnv)).toBe(expected)
})
```

- [ ] **Step 2: Write the failing production integration test**

Add a helper to `testApp.test.ts` that supplies production-valid config
without real values:

```ts
function useSyntheticProductionEnv(): void {
  process.env = {
    ...ORIGINAL_ENV,
    NODE_ENV: 'production',
    PORT: '4000',
    WALLET_API_ALLOWED_ORIGINS: 'https://wallet.example.invalid',
    DB_HOST: 'db.example.invalid',
    DB_PORT: '3306',
    DB_NAME: 'wallet',
    DB_USER: 'wallet',
    DB_PASSWORD: 'synthetic-password',
    JWT_SECRET: 'synthetic-production-jwt-secret',
    MAIL_FROM: 'wallet@example.invalid',
    PUBLIC_BASE_URL: 'https://wallet.example.invalid',
    VERIFIER_PRESENTATION_BASE_URL: 'https://verifier.example.invalid',
  }
}
```

Add:

```ts
test('does not mount development API namespaces in production', async () => {
  useSyntheticProductionEnv()
  const app = createTestApp()

  const devVerifier = await request(app).post('/dev/vp-session').send()
  const devWallet = await request(app)
    .get('/wallet-api/dev/wallet/suspension-status')
  const publicGateway = await request(app)
    .get('/v1/openapi.json')

  expect(devVerifier.status).toBe(404)
  expect(devWallet.status).toBe(404)
  expect(publicGateway.status).toBe(200)
})
```

Restore `process.env` in `afterEach`, not only `afterAll`, so the production
case cannot leak into later tests.

- [ ] **Step 3: Run the policy and integration tests and confirm failure**

Run:

```powershell
yarn test src/developmentApiPolicy.test.ts src/testApp.test.ts --runInBand
```

Expected: FAIL because the policy is missing and the development routers are
currently mounted in production.

- [ ] **Step 4: Implement the shared policy**

Create:

```ts
export function areDevelopmentApisEnabled(
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== 'production'
}
```

- [ ] **Step 5: Gate both development routers in `createTestApp()`**

Compute the policy once per app:

```ts
const developmentApisEnabled = areDevelopmentApisEnabled()
```

Change router mounting to:

```ts
if (developmentApisEnabled) {
  app.use('/dev', express.json({ limit: '1mb' }), vpSessionRouter)
}
app.use('/v1', express.json({ limit: '1mb' }), presentationGatewayRouter)
app.use(
  '/wallet-api',
  express.json({ limit: '1mb' }),
  walletProviderAttestRouter,
)

app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: false, limit: '1mb' }))

app.use('/wallet-api/auth', createAuthRateLimiter())
app.use('/wallet-api/auth', authRouter)
if (developmentApisEnabled) {
  app.use('/wallet-api/dev', devWalletRouter)
}
```

Do not gate `/v1` or `/wallet-api/wallet-attestations`.

- [ ] **Step 6: Run development and production route tests**

Run:

```powershell
yarn test src/developmentApiPolicy.test.ts src/testApp.test.ts src/routes/vpSession.test.ts src/routes/presentationGateway.test.ts --runInBand
```

Expected: PASS. Existing development route tests continue to run under
`NODE_ENV=test`; production requests receive `404`.

- [ ] **Step 7: Commit the security change with rationale**

```powershell
git add server/src/developmentApiPolicy.ts server/src/developmentApiPolicy.test.ts server/src/testApp.ts server/src/testApp.test.ts
git commit -m "fix(server): disable dev APIs in production" -m "Development simulation routes must not be reachable from production deployments."
```

---

### Task 5: Publish non-production Development API documentation

**Files:**

- Create: `server/src/openapi/developmentOpenApi.ts`
- Create: `server/src/openapi/developmentOpenApi.test.ts`
- Create: `server/src/openapi/installDevelopmentSwagger.ts`
- Create: `server/src/openapi/installDevelopmentSwagger.test.ts`
- Modify: `server/src/testApp.ts`

**Interfaces:**

- Consumes:
  - OpenAPI helpers and installer from Task 1.
  - `areDevelopmentApisEnabled()` from Task 4.
- Produces:
  - `developmentOpenApiDocument`
  - `installDevelopmentSwagger(app: Express): void`

The Development document has exactly these operations:

| Method | Path | Success | Errors |
|---|---|---|---|
| POST | `/dev/vp-issuer-key/resolve` | 200 | 400, 422 |
| POST | `/dev/vp-session` | 201 | — |
| PUT | `/dev/vp-session/{sessionId}` | 200 | 400, 404, 409, 410 |
| GET | `/dev/vp-session/{sessionId}/status` | 200 | 404 |
| GET | `/dev/vp-verify` | 200, 202 | 404, 409, 410 |
| GET | `/wallet-api/dev/wallet/suspension-status` | 200 | — |
| GET | `/wallet-api/dev/wallet/renewal-status` | 200 | — |
| POST | `/wallet-api/dev/presentation/suspend-access` | 201 | 400 |
| POST | `/wallet-api/dev/issuer/suspend` | 201 | 400 |
| POST | `/wallet-api/dev/wallet/mark-used` | 201 | 400 |
| GET | `/wallet-api/dev/wallet/used-status` | 200 | 400 |
| POST | `/wallet-api/dev/issuer/holder-revoke/nonce` | 201 | 400 |
| POST | `/wallet-api/dev/issuer/holder-revoke` | 201 | 400 |
| GET | `/wallet-api/dev/wallet/revoke-status` | 200 | 400 |
| POST | `/wallet-api/dev/webhook/credential-event` | 200 | 400 |
| POST | `/wallet-api/dev/wallet/renewal-request` | 201 | 400, 502, 503 |
| POST | `/wallet-api/dev/wallet/renewal-vp/response` | 200 | 400, 404, 409 |

- [ ] **Step 1: Write the failing Development contract test**

Create `developmentOpenApi.test.ts` with the exact method/path inventory above.
Represent operations as strings so duplicate path methods are verified:

```ts
const expectedOperations = [
  'POST /dev/vp-issuer-key/resolve',
  'POST /dev/vp-session',
  'PUT /dev/vp-session/{sessionId}',
  'GET /dev/vp-session/{sessionId}/status',
  'GET /dev/vp-verify',
  'GET /wallet-api/dev/wallet/suspension-status',
  'GET /wallet-api/dev/wallet/renewal-status',
  'POST /wallet-api/dev/presentation/suspend-access',
  'POST /wallet-api/dev/issuer/suspend',
  'POST /wallet-api/dev/wallet/mark-used',
  'GET /wallet-api/dev/wallet/used-status',
  'POST /wallet-api/dev/issuer/holder-revoke/nonce',
  'POST /wallet-api/dev/issuer/holder-revoke',
  'GET /wallet-api/dev/wallet/revoke-status',
  'POST /wallet-api/dev/webhook/credential-event',
  'POST /wallet-api/dev/wallet/renewal-request',
  'POST /wallet-api/dev/wallet/renewal-vp/response',
] as const
```

Build actual operation strings from `document.paths`, sort both arrays, and
assert equality. Also assert:

```ts
expect(developmentOpenApiDocument.info.description).toContain('not available in production')
expect(JSON.stringify(developmentOpenApiDocument)).not.toContain('Bearer ey')
expect(JSON.stringify(developmentOpenApiDocument)).not.toContain('@gmail.com')
```

- [ ] **Step 2: Run the Development contract test and confirm failure**

Run:

```powershell
yarn test src/openapi/developmentOpenApi.test.ts --runInBand
```

Expected: FAIL because the Development document does not exist.

- [ ] **Step 3: Implement the Development OpenAPI document**

Use:

```ts
info: {
  title: 'Development API',
  version: '1.0.0',
  description:
    'Local simulation and diagnostic operations. These routes are not available in production.',
},
servers: [{ url: '/' }],
tags: [
  { name: 'Verifier diagnostics' },
  { name: 'Development presentation sessions' },
  { name: 'Credential suspension' },
  { name: 'Credential lifecycle' },
  { name: 'Holder revocation' },
  { name: 'Push simulation' },
  { name: 'Credential renewal' },
],
```

Use the following exact request-field contracts:

| Operation | Required fields | Optional fields |
|---|---|---|
| issuer-key resolve | `rawVc` | `issuerUrl` |
| suspend presentation access | `eventId`, `credentialId`, `partyName` | — |
| suspend credential | `credentialId` | `suspendedAt`, `acknowledgedAt`, `reasonCode`, `issuerRef`, `updatedAt` |
| mark used | `credentialId` | — |
| used status | query `credentialId` | — |
| holder-revoke nonce | `credentialId`, `holderDid` | — |
| holder revoke | `credentialId`, `holderDid`, `popJwt` | — |
| revoke status | query `credentialId` | — |
| credential-event webhook | `event`, `holderDid`, `credentialId`, `credentialType` | — |
| renewal request | `credentialId`, `credentialType`, `oldHolderDid`, `newHolderDid`, `rawVc` | — |
| renewal VP response | form or JSON `vp_token`, `state` | — |

The webhook `event` enum is:

```ts
[
  'renewal-ready',
  'renewal-required',
  'issuer-suspended',
  'cleanup-pending',
  'old-revoked',
]
```

The renewal state enum is `requested`, `offer-ready`, `revoked`.
Presentation session schemas match Task 3 except Development upload does not
restrict `credentialType` to `ThaiNationalID`.

For `/dev/vp-verify`, document HTML media types and the `Retry-After` header in
the same structure as `/v1/present/verify`.

Use only these safe placeholder styles:

```ts
{
  credentialId: 'credential-synthetic-1',
  holderDid: 'did:key:zSyntheticHolder',
  rawVc: 'synthetic.jwt.vc',
  popJwt: 'synthetic.pop.jwt',
  vpToken: 'synthetic.sd-jwt~synthetic.kb-jwt',
  pushToken: 'ExponentPushToken[synthetic-device]',
}
```

Do not declare Bearer authentication because the current development handlers
do not enforce it and the complete namespace is disabled in production.

- [ ] **Step 4: Implement the gated Development Swagger installer**

Create `installDevelopmentSwagger.ts`:

```ts
import type { Express } from 'express'

import { installSwaggerDocument } from './installSwaggerDocument'
import { developmentOpenApiDocument } from './developmentOpenApi'

export function installDevelopmentSwagger(app: Express): void {
  installSwaggerDocument(app, {
    docsPath: '/dev/docs',
    openApiPath: '/dev/openapi.json',
    document: developmentOpenApiDocument,
    title: 'Development API',
  })
}
```

The installer itself does not read `NODE_ENV`; `createTestApp()` owns the
single policy decision.

- [ ] **Step 5: Write Development Swagger environment tests**

In `installDevelopmentSwagger.test.ts`, assert under `NODE_ENV=test`:

- `/dev/docs/` returns Swagger HTML.
- `/dev/openapi.json` returns JSON with all seventeen operations.
- The served document includes no `/v1/*` production paths and no normal
  `/wallet-api/auth/*` or `/wallet-api/wallet/*` operations.

Under the synthetic production environment from Task 4, assert:

- `/dev/docs/` returns `404`.
- `/dev/openapi.json` returns `404`.
- `/wallet-api/openapi.json` returns `200`.
- `/v1/openapi.json` returns `200`.

- [ ] **Step 6: Mount Development documentation under the shared gate**

In `createTestApp()`:

```ts
installWalletSwagger(app)
installPresentationGatewaySwagger(app)
if (developmentApisEnabled) {
  installDevelopmentSwagger(app)
}
```

Use the same `developmentApisEnabled` value that controls both development
routers.

- [ ] **Step 7: Run all API documentation and route-gate tests**

Run:

```powershell
yarn test src/openapi src/developmentApiPolicy.test.ts src/testApp.test.ts src/routes/vpSession.test.ts src/routes/presentationGateway.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add server/src/openapi/developmentOpenApi.ts server/src/openapi/developmentOpenApi.test.ts server/src/openapi/installDevelopmentSwagger.ts server/src/openapi/installDevelopmentSwagger.test.ts server/src/testApp.ts
git commit -m "docs(server): document development APIs"
```

---

### Task 6: Add workflow guides and finish verification

**Files:**

- Create: `server/docs/wallet-backend-api.md`
- Create: `server/docs/presentation-gateway-api.md`
- Create: `server/docs/development-api.md`
- Modify: `server/README.md`
- Modify: `docs/TASKS.md`

**Interfaces:**

- Consumes the final paths, schemas, environment gate, and examples from Tasks
  1-5.
- Produces human-readable onboarding and workflow documentation without
  duplicating the complete OpenAPI field reference.

- [ ] **Step 1: Write the Wallet Backend guide**

Include:

- Purpose and explicit separation from Issuer OID4VCI execution.
- Local and shared-host base URL guidance without copying an environment
  value.
- Links to `/wallet-api/docs` and `/wallet-api/openapi.json`.
- Authentication workflow: email status, register/login, Bearer authorization,
  wallet listing, credential import, logout.
- PIN-reset workflow and rate-limit behavior.
- Push-token registration's current unauthenticated contract.
- Wallet attestation warning: current `alg: none` WUA/WIA values are
  development mocks, not production attestations.
- cURL examples using `https://wallet.example.invalid`,
  `developer@example.invalid`, `593817`, `Bearer SYNTHETIC_TOKEN`, synthetic
  UUIDs, and `did:key:zSyntheticHolder`.

Do not claim that the backend runs OID4VCI or stores Wallet private keys.

- [ ] **Step 2: Write the Presentation Gateway guide**

Include:

- Verifier ownership boundary.
- Links to `/v1/docs` and `/v1/openapi.json`.
- Session lifecycle: create, share `verifyUrl`, upload, poll, browser verify.
- Current `ThaiNationalID` restriction on the production-style v1 gateway.
- Status meanings: `pending`, `ready`, `verified`, `verify_failed`, `expired`.
- HTML verification behavior, single-consumption behavior, and
  `Retry-After: 2`.
- Synthetic cURL examples that do not claim an illustrative presentation token
  will cryptographically verify.

- [ ] **Step 3: Write the Development API guide**

Start with this warning:

```markdown
> Development APIs are mounted only when `NODE_ENV !== "production"`.
> They simulate Issuer, Verifier, lifecycle, and notification behavior and
> must never be treated as production services.
```

Link to `/dev/docs` and `/dev/openapi.json`. Organize workflows into:

1. Verifier sessions and issuer-key diagnostics.
2. Suspension and single-use state.
3. Holder revocation nonce and PoP.
4. Push-event simulation.
5. Renewal request, VP response, readiness, and revocation state.

Warn readers never to paste production VC, VP, JWT, token, DID, key, or PII
values into development examples or Swagger.

- [ ] **Step 4: Turn `server/README.md` into the documentation index**

Preserve existing setup, deployment configuration, and verification content.
Replace the single API documentation block with a compact table:

| Surface | Guide | Swagger UI | OpenAPI JSON | Production |
|---|---|---|---|---|
| Wallet Backend | `docs/wallet-backend-api.md` | `/wallet-api/docs` | `/wallet-api/openapi.json` | Yes |
| Presentation Gateway | `docs/presentation-gateway-api.md` | `/v1/docs` | `/v1/openapi.json` | Yes |
| Development APIs | `docs/development-api.md` | `/dev/docs` | `/dev/openapi.json` | No |

Explain that `/dev/*` and `/wallet-api/dev/*` return `404` in production.

- [ ] **Step 5: Run documentation hygiene checks**

Run:

```powershell
rg -n "T[B]D|T[O]DO|Bearer ey|@gmail\\.com|BEGIN (RSA|EC|PRIVATE) KEY" server/docs server/README.md server/src/openapi
git diff --check
```

Expected:

- No placeholders, real-looking Bearer tokens, Gmail addresses, or PEM key
  material.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 6: Run complete server verification**

Run:

```powershell
Set-Location server
yarn tsc
yarn test
```

Expected: both commands exit `0`.

- [ ] **Step 7: Manually smoke-test all Swagger surfaces**

Start the server in a non-production environment and verify:

- `/wallet-api/docs/` renders Wallet Backend operations.
- `/v1/docs/` renders Presentation Gateway operations.
- `/dev/docs/` renders Development operations.
- The three Swagger pages load their matching JSON documents.

Then construct the app with the synthetic production environment in the
integration test and confirm the Development documentation and underlying
Development API namespaces return `404`.

- [ ] **Step 8: Update the durable task record**

Add a `2026-07-31` session entry near the top of `docs/TASKS.md` recording:

- Three documentation surfaces and their paths.
- Wallet attestation addition and development-only warning.
- Production gate for `/dev/*` and `/wallet-api/dev/*`.
- Added Markdown guides.
- Exact `yarn tsc` and `yarn test` results.

Preserve all pre-existing uncommitted task entries.

- [ ] **Step 9: Commit documentation and task tracking**

```powershell
git add server/docs/wallet-backend-api.md server/docs/presentation-gateway-api.md server/docs/development-api.md server/README.md docs/TASKS.md
git commit -m "docs(server): add API usage guides"
```
