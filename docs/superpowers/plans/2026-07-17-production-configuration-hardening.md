# Production Configuration Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent production mobile and server runtimes from silently using unsafe endpoint, database, secret, port, or external-service defaults while preserving convenient development and test behavior.

**Architecture:** Keep `server/src/config.ts` as the server configuration boundary and add a typed mobile runtime endpoint boundary under `src/config/`. Development and test defaults remain explicit and isolated; production/release-like runtimes reject missing, insecure, loopback, placeholder, or malformed values at startup/config resolution. Consumers stop reading deployment endpoints directly from environment variables.

**Tech Stack:** TypeScript, Expo/Hermes, React Native, Jest, Node.js, Express, dotenv, Yarn.

## Global Constraints

- Do not change OID4VCI/OID4VP/NFC wire constants, credential formats, storage behavior, database schema, or API contracts.
- Production mobile Wallet API and Broker endpoints must use HTTPS.
- Production server configuration must not fall back to localhost, loopback database settings, development mail addresses, customer development endpoints, or placeholder secrets.
- Development and test defaults may remain available only for explicitly development/test runtimes.
- Do not log secrets, passwords, tokens, connection strings, or full sensitive URLs.
- Use the project’s existing environment variable naming conventions and document variables in environment templates with units, defaults, and effects where applicable.
- Preserve existing user changes in the dirty worktree; modify only files listed in each task.

---

### Task 1: Add mobile runtime endpoint validation

**Files:**
- Create: `src/config/runtimeEndpoints.ts`
- Modify: `src/sdk/installWalletApiFetch.ts`
- Modify: `src/services/vp/brokerBaseUrl.ts`
- Test: `src/config/runtimeEndpoints.test.ts`
- Test: `src/sdk/installWalletApiFetch.test.ts`
- Test: `src/services/vp/brokerBaseUrl.test.ts`

**Interfaces:**
- `readMobileRuntimeEndpoint(name: string, raw: string | undefined, options: { requiredInRelease: boolean; allowHttpInDev: boolean }): string` returns a normalized URL or throws `MobileConfigInvalid:{name}:{reason}`.
- `readMobileRuntimeEndpoint` must reject malformed URLs, credentials in URLs, and empty values. In release-like mode it must reject non-HTTPS URLs and loopback hosts.
- Existing exported functions `getConfiguredWalletApiBaseUrl()` and `resolveBrokerBaseUrl()` retain their public signatures.

- [ ] **Step 1: Write failing endpoint validation tests**

Add tests covering:

```ts
expect(readMobileRuntimeEndpoint('API', 'https://api.example', {
  requiredInRelease: true,
  allowHttpInDev: false,
})).toBe('https://api.example')

expect(() => readMobileRuntimeEndpoint('API', 'http://localhost:4000', {
  requiredInRelease: true,
  allowHttpInDev: false,
})).toThrow('MobileConfigInvalid:API')
```

Also test development HTTP localhost acceptance, missing required release values, malformed URLs, credentials in URLs, and trailing-slash normalization.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `yarn test src/config/runtimeEndpoints.test.ts --runInBand`

Expected: FAIL because `runtimeEndpoints.ts` and `readMobileRuntimeEndpoint` do not exist.

- [ ] **Step 3: Implement the centralized mobile endpoint reader**

Use `__DEV__` to distinguish development from release-like mobile runtime. The reader must:

```ts
const parsed = new URL(raw)
if (parsed.username || parsed.password) throw new Error(`MobileConfigInvalid:${name}:credentials`)
if (!__DEV__ && parsed.protocol !== 'https:') throw new Error(`MobileConfigInvalid:${name}:https-required`)
if (!__DEV__ && isLoopbackHost(parsed.hostname)) throw new Error(`MobileConfigInvalid:${name}:loopback`)
return parsed.toString().replace(/\/$/, '')
```

Use an explicit development default only at the caller boundary. Do not expose the customer Broker URL as the release fallback when the environment value is absent; release must fail clearly.

- [ ] **Step 4: Route mobile endpoint consumers through the reader**

Update `installWalletApiFetch.ts` and `brokerBaseUrl.ts` so environment reads and defaults pass through the centralized reader. Preserve development loopback-to-Metro rewriting only in `__DEV__`.

- [ ] **Step 5: Add regression tests for endpoint consumers**

Verify that development defaults and overrides continue to normalize correctly, while release-like tests reject missing or unsafe Wallet API and Broker values. Keep non-wallet Issuer/Verifier request URLs untouched by the Wallet API fetch adapter.

- [ ] **Step 6: Run mobile focused verification**

Run: `yarn test src/config/runtimeEndpoints.test.ts src/sdk/installWalletApiFetch.test.ts src/services/vp/brokerBaseUrl.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit the mobile configuration slice**

```powershell
git add src/config/runtimeEndpoints.ts src/config/runtimeEndpoints.test.ts src/sdk/installWalletApiFetch.ts src/sdk/installWalletApiFetch.test.ts src/services/vp/brokerBaseUrl.ts src/services/vp/brokerBaseUrl.test.ts
git commit -m "fix(config): validate mobile production endpoints"
```

### Task 2: Harden server configuration validation

**Files:**
- Modify: `server/src/config.ts`
- Modify: `server/src/config.test.ts`
- Modify: `server/src/services/devRenewalOffer.ts`
- Modify: `server/src/services/resolveVpIssuerKey.ts`
- Modify: `server/src/routes/devWallet.ts`

**Interfaces:**
- Extend `ServerConfig` with parsed optional endpoint values used by server services, including `issuerBaseUrl` and `publicBaseUrl` where those flows are enabled.
- Add internal helpers in `server/src/config.ts`: `isProductionRuntime()`, `readRequiredProductionString()`, and `readProductionUrl()`.
- Existing `readConfig(): ServerConfig` remains the only server configuration entry point.

- [ ] **Step 1: Write failing production validation tests**

Extend `server/src/config.test.ts` to prove:

```ts
process.env = {
  ...process.env,
  NODE_ENV: 'production',
  JWT_SECRET: 'production-secret-not-default',
  DB_HOST: 'db.example',
  DB_NAME: 'wallet',
  DB_USER: 'wallet-user',
  DB_PASSWORD: 'password',
  WALLET_API_ALLOWED_ORIGINS: 'https://wallet.example',
  VERIFIER_PRESENTATION_BASE_URL: 'https://verifier.example',
}
expect(readConfig().verifierPresentationBaseUrl).toBe('https://verifier.example')
```

Add tests for missing JWT secret, placeholder JWT secret, localhost external URLs, loopback database host, development mail address, invalid production URL protocol, and invalid ports. Retain tests proving deterministic test defaults still work.

- [ ] **Step 2: Run server config tests and verify failure**

Run: `yarn --cwd server test src/config.test.ts --runInBand`

Expected: FAIL for the new production rejection cases.

- [ ] **Step 3: Implement server validation helpers**

Production checks must be based on `NODE_ENV === 'production'`; tests must remain deterministic. Reject:

- `local-dev-change-me` or an empty JWT secret
- `localhost`, `127.0.0.1`, `0.0.0.0`, and `::1` for production service/database hosts where prohibited
- `wallet-noreply@localhost`
- HTTP URLs for production external service configuration
- Missing values for production-required variables
- Ports outside `1..65535`

Errors must use configuration names and reasons, for example `ConfigInvalid: VERIFIER_PRESENTATION_BASE_URL must use HTTPS`, without including raw values.

- [ ] **Step 4: Remove direct server environment reads from services**

Pass the parsed `ServerConfig` values into `devRenewalOffer`, `resolveVpIssuerKey`, and the public URL construction in `devWallet`. Do not add new process-wide singleton state. Preserve dependency injection already used by tests.

- [ ] **Step 5: Run server tests and type-check**

Run: `yarn --cwd server test --runInBand` and `yarn --cwd server tsc`

Expected: PASS with no new failures or TypeScript errors.

- [ ] **Step 6: Commit the server configuration slice**

```powershell
git add server/src/config.ts server/src/config.test.ts server/src/services/devRenewalOffer.ts server/src/services/resolveVpIssuerKey.ts server/src/routes/devWallet.ts
git commit -m "fix(config): reject unsafe server defaults"
```

### Task 3: Document deployment configuration

**Files:**
- Modify: `.env.example`
- Modify: `server/.env.example`
- Modify: `server/.env.development.local.example`
- Modify: `server/README.md`
- Modify: `docs/GETTING_STARTED.md`

**Interfaces:**
- Environment templates must describe the exact variable names consumed by the mobile and server configuration boundaries.
- Documentation must distinguish development/test defaults from required production values.

- [ ] **Step 1: Inventory variables against code**

Compare the templates with the final readers and ensure endpoint variables are present for Wallet API, Broker, Issuer, Verifier, allowed origins, certificate pins, database, JWT, mail, and enabled presentation flows.

- [ ] **Step 2: Update environment templates**

Add comments stating unit, default, and effect for every configurable timing or size value. Mark production-required values explicitly. Do not place real secrets, private keys, or customer credentials in templates.

- [ ] **Step 3: Update onboarding documentation**

Document that development may use localhost/LAN HTTP, while production requires HTTPS and explicit non-loopback endpoints. Document the expected startup validation errors and the commands for checking configuration.

- [ ] **Step 4: Run setup checks**

Run: `yarn setup --check`

Expected: the existing development environment check remains usable and reports missing values without printing secrets.

- [ ] **Step 5: Commit the documentation slice**

```powershell
git add .env.example server/.env.example server/.env.development.local.example server/README.md docs/GETTING_STARTED.md
git commit -m "docs(config): document production environment"
```

### Task 4: Update project tracking and complete verification

**Files:**
- Modify: `docs/TASKS.md`
- Test: all focused tests from Tasks 1–3

- [ ] **Step 1: Record the completed implementation slice**

Add a dated entry to `docs/TASKS.md` describing mobile endpoint validation, server unsafe-default rejection, environment-template updates, and any explicitly deferred timing-policy migration.

- [ ] **Step 2: Run focused mobile and server tests**

Run:

```powershell
yarn test src/config/runtimeEndpoints.test.ts src/sdk/installWalletApiFetch.test.ts src/services/vp/brokerBaseUrl.test.ts --runInBand
yarn --cwd server test --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run repository verification**

Run: `yarn tsc --noEmit`

Expected: no new TypeScript errors attributable to this work. Existing unrelated errors must be recorded in `docs/TASKS.md` rather than hidden.

Run: `yarn lint`

Expected: no new lint errors attributable to this work.

- [ ] **Step 4: Verify release-like rejection manually**

Start the server with `NODE_ENV=production` and omit or replace one required variable at a time. Confirm startup exits with a key-specific `ConfigInvalid` error and no secret value in output. Build/run the mobile app with release-like configuration missing the Wallet API or Broker URL and confirm startup/config resolution rejects it.

- [ ] **Step 5: Commit tracking and verification results**

```powershell
git add docs/TASKS.md
git commit -m "docs(tasks): record config hardening verification"
```
