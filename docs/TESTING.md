# Testing Standards

This document defines mandatory testing practices for the the wallet.

## 1. Coverage Target

Target minimum coverage:

```typescript
coverageThreshold: {
  global: {
    lines: 80,
    functions: 80,
    branches: 75,
    statements: 80,
  },
}
```

Generated SDK files under `src/sdk/**`, type declarations, and test files are excluded from coverage collection.

Current note: test infrastructure exists and focused tests have been added, but full coverage enforcement remains a Phase 4 release gate.

## 2. Commands

Root app:

```bash
yarn tsc --noEmit
yarn lint
yarn test
yarn test:coverage
```

Local backend:

```bash
cd server
yarn tsc
yarn test
```

## 3. Test Framework

- Runner: Jest with `jest-expo`
- Component testing: `@testing-library/react-native`
- Network mocking: MSW where HTTP behavior is under test
- Language: TypeScript only

## 4. Native Module Mock Patterns

Native JSI or Nitro modules cannot run directly in Jest and must be mocked at module boundaries.

### `react-native-mmkv`

Use a Map-backed mock in `src/__mocks__/react-native-mmkv.ts`.

Required behaviors:

- `getString`
- `set`
- `remove`
- `delete`
- `contains`
- `getAllKeys`
- `clearAll`

Each test must receive isolated state.

### `@animo-id/expo-secure-environment`

Mock the module boundary. Tests should verify that signing is requested with expected payload bytes; they should not attempt to prove native ECDSA validity.

### `react-native-quick-crypto`

Mock only the specific functions used if JSI bindings are unavailable in Jest.

## 5. Network Tests

All Issuer and Wallet Backend HTTP calls in tests must be intercepted. Real network calls in Jest are forbidden.

Recommended handler grouping:

```text
src/__tests__/setup/
  handlers/
    issuer.ts
    walletApi.ts
    verifier.ts
  index.ts
```

Use `onUnhandledRequest: 'error'` so unmocked network calls fail tests immediately.

## 6. Current Focused Tests

Current implementation has focused tests for:

- crypto behavior and secure environment policy
- storage behavior through MMKV mocks
- OID4VCI exchange service contract behavior
- card schema lookup
- generic `CredentialCard`
- SDK base URL fetch adapter
- local backend behavior under `server/`

Keep tests focused around security boundaries, protocol normalization, storage persistence, and UI rendering from config.

## 7. Test Conventions

- Co-locate unit tests beside modules when practical.
- Put integration tests under `src/__tests__/integration/` when they span modules.
- Do not read or write the real filesystem in tests unless the test is explicitly for the local backend migration layer.
- Do not use real timers for async flow tests; use Jest fake timers when time matters.
- Suppress `console.warn` and `console.error` only when the test asserts expected error handling.
