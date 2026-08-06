# Wallet Backend Swagger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish browser-based OpenAPI documentation for the normal Node Wallet backend routes at `/wallet-api/docs` without changing the existing Broker Swagger or API authorization behavior.

**Architecture:** Define one explicit OpenAPI 3 document in `server/src/openapi/walletOpenApi.ts`, then mount its JSON representation and Swagger UI through a focused `installWalletSwagger()` function. Install those routes in the existing Express application before the API routers; keep the document public, same-origin, and limited to normal `/wallet-api/auth/*` and `/wallet-api/wallet/*` operations.

**Tech Stack:** TypeScript 5.9, Express 4, `swagger-ui-express` 5, Jest 29, `ts-jest`, Supertest

## Global Constraints

- Keep Broker Swagger unchanged at `/swagger/index.html`.
- Publish Wallet Swagger UI at `/wallet-api/docs` and OpenAPI JSON at `/wallet-api/openapi.json`.
- Do not add Swagger enablement, username, password, or other new environment variables.
- Document normal Wallet endpoints only; exclude `/wallet-api/dev/*` and `/dev/*`.
- Preserve current endpoint authentication exactly: only wallet listing and credential import require Bearer JWT.
- Add Swagger Bearer authorization support without changing `requireAuth`.
- Use synthetic examples only; never include real tokens, credentials, DIDs, claims, key material, seeds, or PII.
- Reuse the existing `swagger-ui-express` dependency; add no package.
- Preserve unrelated dirty-worktree changes and stage only files belonging to each task.
- Update `docs/TASKS.md` after the completed implementation slice.

## File Structure

- Create `server/src/openapi/walletOpenApi.ts`: central OpenAPI 3 document and component schemas.
- Create `server/src/openapi/walletOpenApi.test.ts`: contract coverage, exclusions, statuses, and Bearer security assertions.
- Create `server/src/openapi/installWalletSwagger.ts`: Express installer for Swagger HTML and OpenAPI JSON.
- Create `server/src/openapi/installWalletSwagger.test.ts`: HTTP-level Swagger route assertions.
- Modify `server/src/testApp.ts`: install Wallet Swagger without changing existing API routers.
- Modify `server/README.md`: document URLs, public visibility, JWT use, and reverse-proxy requirement.
- Modify `docs/TASKS.md`: record the completed slice and verification evidence.

---

### Task 1: Define the Wallet OpenAPI contract

**Files:**
- Create: `server/src/openapi/walletOpenApi.test.ts`
- Create: `server/src/openapi/walletOpenApi.ts`

**Interfaces:**
- Produces: `walletOpenApiDocument`, a readonly OpenAPI-compatible object consumed by `installWalletSwagger(app)`.
- Consumes: the existing route contracts in `server/src/routes/auth.ts`, `wallets.ts`, `credentials.ts`, and `pushTokens.ts`.

- [ ] **Step 1: Write the failing OpenAPI contract tests**

Create `server/src/openapi/walletOpenApi.test.ts`:

```ts
import { walletOpenApiDocument } from './walletOpenApi'

type OpenApiOperation = {
  security?: Array<Record<string, string[]>>
  responses?: Record<string, unknown>
}

type OpenApiPathItem = {
  get?: OpenApiOperation
  post?: OpenApiOperation
}

const expectedPaths = [
  '/wallet-api/auth/email-status',
  '/wallet-api/auth/register',
  '/wallet-api/auth/login',
  '/wallet-api/auth/pin-reset/request',
  '/wallet-api/auth/pin-reset/verify',
  '/wallet-api/auth/pin-reset/confirm',
  '/wallet-api/auth/logout',
  '/wallet-api/wallet/accounts/wallets',
  '/wallet-api/wallet/{wallet}/credentials/import',
  '/wallet-api/wallet/push-token',
] as const

function paths(): Record<string, OpenApiPathItem> {
  return walletOpenApiDocument.paths as Record<string, OpenApiPathItem>
}

describe('walletOpenApiDocument', () => {
  test('publishes the complete normal Wallet API surface', () => {
    expect(walletOpenApiDocument.openapi).toBe('3.0.3')
    expect(walletOpenApiDocument.servers).toEqual([{ url: '/' }])
    expect(Object.keys(paths()).sort()).toEqual([...expectedPaths].sort())
  })

  test('does not publish development routes', () => {
    expect(
      Object.keys(paths()).some(
        (path) => path.startsWith('/wallet-api/dev/') || path.startsWith('/dev/'),
      ),
    ).toBe(false)
  })

  test('defines Bearer JWT authorization only on protected operations', () => {
    expect(walletOpenApiDocument.components.securitySchemes).toEqual({
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    })
    expect(paths()['/wallet-api/wallet/accounts/wallets'].get?.security).toEqual([
      { bearerAuth: [] },
    ])
    expect(
      paths()['/wallet-api/wallet/{wallet}/credentials/import'].post?.security,
    ).toEqual([{ bearerAuth: [] }])
    expect(paths()['/wallet-api/wallet/push-token'].post?.security).toBeUndefined()
    expect(paths()['/wallet-api/auth/login'].post?.security).toBeUndefined()
  })

  test('documents implemented success and error statuses', () => {
    expect(
      Object.keys(paths()['/wallet-api/auth/login'].post?.responses ?? {}).sort(),
    ).toEqual(['200', '400', '429', '500'])
    expect(
      Object.keys(
        paths()['/wallet-api/wallet/{wallet}/credentials/import'].post?.responses ?? {},
      ).sort(),
    ).toEqual(['201', '400', '401', '403', '500'])
    expect(
      Object.keys(paths()['/wallet-api/wallet/push-token'].post?.responses ?? {}).sort(),
    ).toEqual(['200', '400'])
  })
})
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```powershell
Set-Location server
yarn test src/openapi/walletOpenApi.test.ts
```

Expected: FAIL because `./walletOpenApi` does not exist.

- [ ] **Step 3: Implement the central OpenAPI document**

Create `server/src/openapi/walletOpenApi.ts` with this top-level contract:

```ts
const jsonContent = (schema: Record<string, unknown>) => ({
  content: {
    'application/json': { schema },
  },
})

const schemaRef = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
})

const responseRef = (name: string) => ({
  $ref: `#/components/responses/${name}`,
})

const bearerSecurity = [{ bearerAuth: [] }]

export const walletOpenApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Wallet Backend API',
    version: '1.0.0',
    description:
      'Normal Wallet account, session, wallet, credential import, and push-token operations.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Authentication' },
    { name: 'Wallets' },
    { name: 'Credentials' },
    { name: 'Push notifications' },
  ],
  paths: {},
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {},
    responses: {},
  },
} as const
```

Replace the empty `schemas`, `responses`, and `paths` objects with explicit
OpenAPI entries matching this exact route matrix:

| Method and path | Tag | Request schema | Success | Other responses | Bearer |
|---|---|---|---|---|---|
| `POST /wallet-api/auth/email-status` | Authentication | `EmailStatusRequest` | `200 EmailStatusResponse` | `400`, `429`, `500` | No |
| `POST /wallet-api/auth/register` | Authentication | `RegisterRequest` | `201` no body | `400`, `409`, `500` | No |
| `POST /wallet-api/auth/login` | Authentication | `LoginRequest` | `200 LoginResponse` | `400`, `429`, `500` | No |
| `POST /wallet-api/auth/pin-reset/request` | Authentication | `PinResetRequest` | `204` no body | `400`, `429`, `500` | No |
| `POST /wallet-api/auth/pin-reset/verify` | Authentication | `PinResetVerifyRequest` | `204` no body | `400`, `429`, `500` | No |
| `POST /wallet-api/auth/pin-reset/confirm` | Authentication | `PinResetConfirmRequest` | `204` no body | `400`, `429`, `500` | No |
| `POST /wallet-api/auth/logout` | Authentication | none | `200 EmptyObject` | none | No; token is optional in the current handler |
| `GET /wallet-api/wallet/accounts/wallets` | Wallets | none | `200 WalletListResponse` | `401`, `500` | Yes |
| `POST /wallet-api/wallet/{wallet}/credentials/import` | Credentials | `CredentialImportRequest` plus required string path parameter `wallet` | `201 CredentialImportResponse` | `400`, `401`, `403`, `500` | Yes |
| `POST /wallet-api/wallet/push-token` | Push notifications | `PushTokenRequest` | `200 PushTokenResponse` | `400` | No |

Define these component schemas exactly:

```ts
{
  ErrorResponse: {
    type: 'object',
    required: ['message'],
    properties: { message: { type: 'string', example: 'Bad Request' } },
  },
  EmptyObject: {
    type: 'object',
    additionalProperties: false,
  },
  EmailStatusRequest: {
    type: 'object',
    required: ['email'],
    properties: { email: { type: 'string', format: 'email', example: 'tester@example.com' } },
  },
  EmailStatusResponse: {
    type: 'object',
    required: ['exists'],
    properties: { exists: { type: 'boolean', example: true } },
  },
  RegisterRequest: {
    type: 'object',
    required: ['type', 'name', 'email', 'pin'],
    properties: {
      type: { type: 'string', enum: ['email'] },
      name: { type: 'string', example: 'Test User' },
      email: { type: 'string', format: 'email', example: 'tester@example.com' },
      pin: { type: 'string', pattern: '^\\d{6}$', example: '135790' },
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['type', 'email', 'pin'],
    properties: {
      type: { type: 'string', enum: ['email'] },
      email: { type: 'string', format: 'email', example: 'tester@example.com' },
      pin: { type: 'string', pattern: '^\\d{6}$', example: '135790' },
    },
  },
  LoginResponse: {
    type: 'object',
    required: ['id', 'token'],
    properties: {
      id: { type: 'string', format: 'uuid', example: '11111111-1111-4111-8111-111111111111' },
      token: { type: 'string', example: 'synthetic.jwt.value' },
    },
  },
  PinResetRequest: {
    type: 'object',
    required: ['email'],
    properties: { email: { type: 'string', format: 'email', example: 'tester@example.com' } },
  },
  PinResetVerifyRequest: {
    type: 'object',
    required: ['email', 'otp'],
    properties: {
      email: { type: 'string', format: 'email', example: 'tester@example.com' },
      otp: { type: 'string', pattern: '^\\d{6}$', example: '246802' },
    },
  },
  PinResetConfirmRequest: {
    type: 'object',
    required: ['email', 'otp', 'pin'],
    properties: {
      email: { type: 'string', format: 'email', example: 'tester@example.com' },
      otp: { type: 'string', pattern: '^\\d{6}$', example: '246802' },
      pin: { type: 'string', pattern: '^\\d{6}$', example: '135790' },
    },
  },
  WalletSummary: {
    type: 'object',
    required: ['id', 'name', 'createdOn', 'addedOn', 'permission'],
    properties: {
      id: { type: 'string', format: 'uuid', example: '22222222-2222-4222-8222-222222222222' },
      name: { type: 'string', example: 'Default Wallet' },
      createdOn: { type: 'string', format: 'date-time' },
      addedOn: { type: 'string', format: 'date-time' },
      permission: { type: 'string', enum: ['ADMINISTRATE'] },
    },
  },
  WalletListResponse: {
    type: 'object',
    required: ['account', 'wallets'],
    properties: {
      account: { type: 'string', format: 'uuid' },
      wallets: { type: 'array', items: schemaRef('WalletSummary') },
    },
  },
  CredentialImportRequest: {
    type: 'object',
    required: ['jwt', 'associated_did'],
    properties: {
      jwt: { type: 'string', example: 'synthetic.jwt.vc' },
      associated_did: { type: 'string', example: 'did:key:zSyntheticHolder' },
    },
  },
  CredentialImportResponse: {
    type: 'object',
    required: ['id', 'wallet', 'document', 'format', 'pending', 'addedOn'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      wallet: { type: 'string', format: 'uuid' },
      document: { type: 'string', example: 'synthetic.jwt.vc' },
      format: { type: 'string', enum: ['jwt_vc_json'] },
      pending: { type: 'boolean', enum: [false] },
      addedOn: { type: 'string', format: 'date-time' },
    },
  },
  PushTokenRequest: {
    type: 'object',
    required: ['token', 'holderDid'],
    properties: {
      token: { type: 'string', example: 'ExponentPushToken[synthetic-device]' },
      holderDid: { type: 'string', example: 'did:key:zSyntheticHolder' },
    },
  },
  PushTokenResponse: {
    type: 'object',
    required: ['ok'],
    properties: { ok: { type: 'boolean', enum: [true] } },
  },
}
```

Define reusable component responses for `400`, `401`, `403`, `409`, `429`,
and `500`, each with the implemented description and
`application/json` `ErrorResponse` schema. Each operation must reference only
the responses listed in the route matrix. Do not document `404` because none of
the normal handlers currently returns it.

- [ ] **Step 4: Run the focused contract test**

Run:

```powershell
yarn test src/openapi/walletOpenApi.test.ts
```

Expected: PASS with four tests.

- [ ] **Step 5: Type-check the server**

Run:

```powershell
yarn tsc
```

Expected: exit `0`.

- [ ] **Step 6: Commit the OpenAPI contract**

```powershell
git add server/src/openapi/walletOpenApi.ts server/src/openapi/walletOpenApi.test.ts
git commit -m "feat(server): define Wallet OpenAPI"
```

---

### Task 2: Serve Swagger UI and OpenAPI JSON

**Files:**
- Create: `server/src/openapi/installWalletSwagger.test.ts`
- Create: `server/src/openapi/installWalletSwagger.ts`
- Modify: `server/src/testApp.ts`

**Interfaces:**
- Consumes: `walletOpenApiDocument` from Task 1.
- Produces: `installWalletSwagger(app: Express): void`.
- Publishes: `GET /wallet-api/docs/` and `GET /wallet-api/openapi.json`.

- [ ] **Step 1: Write failing HTTP route tests**

Create `server/src/openapi/installWalletSwagger.test.ts`:

```ts
import request from 'supertest'

import { createTestApp } from '../testApp'

describe('Wallet Swagger routes', () => {
  test('serves Swagger UI HTML', async () => {
    const response = await request(createTestApp()).get('/wallet-api/docs/')

    expect(response.status).toBe(200)
    expect(response.type).toBe('text/html')
    expect(response.text).toContain('Swagger UI')
  })

  test('serves the OpenAPI JSON document', async () => {
    const response = await request(createTestApp()).get('/wallet-api/openapi.json')

    expect(response.status).toBe(200)
    expect(response.type).toBe('application/json')
    expect(response.body.openapi).toBe('3.0.3')
    expect(response.body.paths).toHaveProperty('/wallet-api/wallet/push-token')
  })

  test('keeps development routes out of the public document', async () => {
    const response = await request(createTestApp()).get('/wallet-api/openapi.json')
    const documentedPaths = Object.keys(response.body.paths as Record<string, unknown>)

    expect(
      documentedPaths.some(
        (path) => path.startsWith('/wallet-api/dev/') || path.startsWith('/dev/'),
      ),
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Run the Swagger route test to verify it fails**

Run:

```powershell
Set-Location server
yarn test src/openapi/installWalletSwagger.test.ts
```

Expected: FAIL because both documentation routes return `404`.

- [ ] **Step 3: Implement the Express Swagger installer**

Create `server/src/openapi/installWalletSwagger.ts`:

```ts
import type { Express } from 'express'
import swaggerUi from 'swagger-ui-express'

import { walletOpenApiDocument } from './walletOpenApi'

export function installWalletSwagger(app: Express): void {
  app.get('/wallet-api/openapi.json', (_req, res) => {
    res.status(200).json(walletOpenApiDocument)
  })

  app.use(
    '/wallet-api/docs',
    swaggerUi.serve,
    swaggerUi.setup(walletOpenApiDocument, {
      customSiteTitle: 'Wallet Backend API',
    }),
  )
}
```

Modify `server/src/testApp.ts`:

```ts
import { installWalletSwagger } from './openapi/installWalletSwagger'
```

Call the installer immediately after `const app = express()` and before the
CORS/API router middleware:

```ts
export function createTestApp(): express.Express {
  const app = express()

  installWalletSwagger(app)
  app.use(createCorsMiddleware())
```

Do not alter the existing `/swagger/index.html`, `/wallet-api/auth`,
`/wallet-api/wallet`, `/wallet-api/dev`, `/dev`, or `/v1` mounts.

- [ ] **Step 4: Run the focused Swagger tests**

Run:

```powershell
yarn test src/openapi/walletOpenApi.test.ts src/openapi/installWalletSwagger.test.ts
```

Expected: PASS with seven tests.

- [ ] **Step 5: Run the full server verification**

Run:

```powershell
yarn tsc
yarn test
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit the Swagger routes**

```powershell
git add server/src/openapi/installWalletSwagger.ts server/src/openapi/installWalletSwagger.test.ts server/src/testApp.ts
git commit -m "feat(server): serve Wallet Swagger"
```

---

### Task 3: Document deployment and record completion

**Files:**
- Modify: `server/README.md`
- Modify: `docs/TASKS.md`

**Interfaces:**
- Consumes: the public documentation routes delivered by Task 2.
- Produces: operator instructions for local and shared-host access.

- [ ] **Step 1: Add the Wallet API documentation section**

In `server/README.md`, add this section after `## Scope`:

```markdown
## API documentation

The Wallet backend publishes public interactive documentation:

- Swagger UI: `http://localhost:4000/wallet-api/docs`
- OpenAPI JSON: `http://localhost:4000/wallet-api/openapi.json`

On the shared HTTPS host, use:

- Wallet Swagger UI: `https://wallet.zenithcomp.co.th:455/wallet-api/docs`
- Broker Swagger UI: `https://wallet.zenithcomp.co.th:455/swagger/index.html`

The Wallet documentation covers normal `/wallet-api/auth/*` and
`/wallet-api/wallet/*` operations only. Development routes are intentionally
excluded. Use Swagger **Authorize** with a Wallet login JWT for protected
operations.

The reverse proxy must preserve the complete `/wallet-api/*` path when
forwarding requests to the Node process on port `4000`. The documentation is
public; examples contain synthetic data only.
```

- [ ] **Step 2: Record the completed slice in the task tracker**

Add a new top section to `docs/TASKS.md` without overwriting the existing
2026-07-30 entries:

```markdown
### Session 2026-07-30 (Wallet backend Swagger)

- Added public Wallet Swagger UI at `/wallet-api/docs` and OpenAPI JSON at
  `/wallet-api/openapi.json`; existing Broker Swagger remains unchanged.
- Documented normal Auth, Wallet, Credential, and Push endpoints with Bearer
  JWT authorization support; development routes and real sensitive examples
  are excluded.
- Verification: focused OpenAPI/Swagger tests, full server tests, server
  TypeScript, root TypeScript, and lint.
```

- [ ] **Step 3: Run repository verification**

From `server/`:

```powershell
yarn tsc
yarn test
```

From the repository root:

```powershell
yarn tsc --noEmit
yarn lint
```

Expected: server TypeScript and tests exit `0`; root TypeScript and lint exit
`0`. If an unrelated pre-existing failure remains, preserve its full output,
do not modify unrelated files, and report it accurately in `docs/TASKS.md`.

- [ ] **Step 4: Perform the public-path smoke test after deployment**

Open:

```text
https://wallet.zenithcomp.co.th:455/wallet-api/docs
```

Verify:

1. Swagger UI loads without affecting
   `https://wallet.zenithcomp.co.th:455/swagger/index.html`.
2. `POST /wallet-api/wallet/push-token` appears under **Push notifications**.
3. **Try it out** with the synthetic request returns `200 {"ok":true}`.
4. The server terminal logs `[push-notifications] token-registered`.

- [ ] **Step 5: Commit documentation and task state**

```powershell
git add server/README.md docs/TASKS.md
git commit -m "docs(server): document Wallet Swagger"
```
