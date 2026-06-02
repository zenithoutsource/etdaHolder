# Testing Standards

This document defines mandatory testing practices for the ETDA Wallet. All requirements apply to every pull request. CI enforces coverage thresholds — builds that fall below them fail.

---

## 1. Coverage Threshold

**Minimum: 80% line coverage** across unit and integration tests.

This threshold is enforced in `jest.config.ts` using the `coverageThreshold` option:

```typescript
coverageThreshold: {
  global: {
    lines: 80,
    functions: 80,
    branches: 75,
    statements: 80,
  },
},
```

Coverage is collected on `src/**/*.ts` and `src/**/*.tsx`. Test files, type declaration files, and generated SDK files (`src/sdk/**`) are excluded from coverage collection.

The CI pipeline runs `yarn test --coverage` and fails if any threshold is not met. No threshold exceptions are granted without an ADR.

---

## 2. Test Framework

- **Runner:** Jest (configured via `jest.config.ts`, preset `jest-expo`)
- **Component testing:** `@testing-library/react-native`
- **Network mocking:** Mock Service Worker (MSW) — see Section 4

All tests are written in TypeScript. No `.js` test files.

---

## 3. Native JSI and Nitro Module Mock Patterns

Native modules that use JSI or Nitro cannot run in the Jest Node.js environment. They must be mocked at the module boundary. The following patterns are mandatory.

### react-native-mmkv

MMKV uses a C++ JSI implementation that does not run in Jest. Replace it with an in-memory `Map`-backed implementation.

Create `src/__mocks__/react-native-mmkv.ts`:

```typescript
export class MMKV {
  private store = new Map<string, string | number | boolean | Uint8Array>();

  getString(key: string): string | undefined {
    const val = this.store.get(key);
    return typeof val === 'string' ? val : undefined;
  }

  set(key: string, value: string | number | boolean | Uint8Array): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  contains(key: string): boolean {
    return this.store.has(key);
  }

  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }

  clearAll(): void {
    this.store.clear();
  }
}
```

Register the mock in `jest.config.ts`:

```typescript
moduleNameMapper: {
  'react-native-mmkv': '<rootDir>/src/__mocks__/react-native-mmkv.ts',
},
```

Each test that creates an MMKV instance receives an isolated `Map` — no state leaks between tests because the `Map` is created per `new MMKV()` call.

### @animo-id/expo-secure-environment

The native signing module cannot run in Jest. Mock it at the module boundary.

Create `src/__mocks__/@animo-id/expo-secure-environment.ts`:

```typescript
export const generateKeypair = jest.fn().mockResolvedValue(undefined);

export const getPublicKey = jest.fn().mockResolvedValue(
  new Uint8Array(65) // uncompressed P-256 public key placeholder
);

export const sign = jest.fn().mockResolvedValue(
  new Uint8Array(64) // R || S signature placeholder
);
```

Tests that verify PoP JWT construction should assert that `sign` was called with the expected payload bytes, not that the signature bytes are cryptographically valid (that is the native module's concern).

### react-native-quick-crypto

If quick-crypto JSI bindings are unavailable in Jest, mock the specific functions used:

```typescript
jest.mock('react-native-quick-crypto', () => ({
  randomBytes: (size: number) => Buffer.alloc(size, 0),
  createHash: () => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue(Buffer.alloc(32, 0)),
  }),
}));
```

---

## 4. Network Traffic Interception with MSW

All HTTP calls to external services (Issuer endpoints) and to the company API gateway must be intercepted by Mock Service Worker in tests. Real network calls in the Jest environment are forbidden.

### Setup

Install MSW and configure a Node.js server (not browser service worker):

```typescript
// src/__tests__/setup/msw.ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`onUnhandledRequest: 'error'` ensures that any network call without a registered handler fails the test immediately. This prevents silent test gaps where real network calls succeed or silently fail.

### Handler Organization

Handlers are organized by service boundary:

```
src/__tests__/setup/
  handlers/
    issuer.ts       # /.well-known/openid-credential-issuer, /token, /credential
    walletApi.ts    # /wallet-api/wallet/{walletId}/credentials/import and other allowed endpoints
    verifier.ts     # (post-v1) OID4VP Authorization Request/Response — added when online presentation lands
  index.ts          # re-exports all handlers
```

### Example Issuer Handler

```typescript
// src/__tests__/setup/handlers/issuer.ts
import { http, HttpResponse } from 'msw';

export const issuerHandlers = [
  http.get('https://issuer.example.com/.well-known/openid-credential-issuer', () => {
    return HttpResponse.json({
      issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        ThaiNationalID: {
          format: 'jwt_vc_json',
          display: [{ name: 'Thai National ID', locale: 'en' }],
        },
      },
    });
  }),

  http.post('https://issuer.example.com/token', () => {
    return HttpResponse.json({
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 300,
    });
  }),

  http.post('https://issuer.example.com/credential', () => {
    return HttpResponse.json({
      credential: 'eyJhbGciOiJFUzI1NiJ9.mock.signature',
      format: 'jwt_vc_json',
    });
  }),
];
```

### Example Company API Handler

```typescript
// src/__tests__/setup/handlers/walletApi.ts
import { http, HttpResponse } from 'msw';

export const walletApiHandlers = [
  http.post('/wallet-api/wallet/:walletId/credentials/import', () => {
    return HttpResponse.json({ id: 'mock-credential-id' }, { status: 201 });
  }),
];
```

---

## 5. Test File Conventions

- Test files live adjacent to the module under test: `signingKey.test.ts` sits next to `signingKey.ts`.
- Integration test files that span multiple modules live in `src/__tests__/integration/`.
- No test should read from or write to the real filesystem. Use in-memory mocks.
- No test should call `setTimeout` or `setInterval` directly — use Jest fake timers.
- `console.error` and `console.warn` are suppressed in test output unless the test explicitly asserts on them. Unexpected error logs indicate missing mocks or real exceptions leaking through.
