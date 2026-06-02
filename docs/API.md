# API Integration

## Orval Toolchain

The company backend API client is generated from `walletApi.json` (OpenAPI 3.1, walt.id wallet API v0.20.1) using [Orval](https://orval.dev/). The generated client lives in `src/sdk/`. Do not hand-edit files in `src/sdk/` — they are overwritten on every regeneration.

### Configuration

Orval is configured in `orval.config.ts` at the project root:

```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  walletApi: {
    input: './walletApi.json',
    output: {
      target: './src/sdk/walletApi.ts',
      client: 'fetch',
      mode: 'single',
      override: {
        operationId: {
          // Only generate the allowed operations listed in the Protocol Boundary Matrix.
          // All other operations are excluded at generation time.
          include: [
            'generateKey',
            'createDidKey',
            'importCredential',
          ],
        },
      },
    },
  },
});
```

Regenerate the client after any change to `walletApi.json`:

```bash
npx orval --config orval.config.ts
```

The generated file is committed to version control so that CI and team members do not need to run Orval on every checkout. Re-run Orval when `walletApi.json` changes.

---

## Protocol Boundary Matrix

This matrix defines which wallet API endpoints the application is permitted to call from `src/`. It is the authoritative source for what the Orval-generated client exposes and what is forbidden.

### Allowed SDK Endpoints

These endpoints are included in the generated client and may be called from application code.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/wallet-api/wallet/{walletId}/keys/generate` | Generate a server-side key record linked to the wallet (not the hardware signing key — used for wallet identity registration). |
| `POST` | `/wallet-api/wallet/{walletId}/dids/create/key` | Create a `did:key` DID document from the registered key, used as the wallet's DID in credential requests. |
| `POST` | `/wallet-api/wallet/{walletId}/credentials/import` | Import a finalized VC JWT into the company backend after successful on-device OID4VCI acquisition. |

These are the only endpoints that the Orval configuration generates TypeScript bindings for. No other endpoint in `walletApi.json` produces a callable function in `src/sdk/`.

### Forbidden SDK Endpoints (Bypassed On-Device)

These endpoints exist in `walletApi.json` and in the walt.id wallet backend. They are explicitly excluded from the Orval-generated client. Application code must not call them. They are bypassed because their logic runs entirely on-device using native client execution loops.

| Method | Path | Reason for Bypass |
|---|---|---|
| `GET` | `/wallet-api/wallet/{walletId}/exchange/resolveCredentialOffer` | Credential offer resolution runs on-device via `@sphereon/oid4vci-client`. Routing this through the backend would expose raw credential offer URIs to the server and add unnecessary latency and a remote failure point. |
| `POST` | `/wallet-api/wallet/{walletId}/exchange/useOfferRequest` | The full OID4VCI token exchange, PoP JWT construction, and credential request loop runs on-device via `@sphereon/oid4vci-client` and `@animo-id/expo-secure-environment`. Using the backend endpoint would require the server to construct the PoP JWT, which contradicts the hardware non-extractable key architecture (ADR 0001). |

Any PR that imports or calls these forbidden endpoints from `src/` must be rejected during code review.

---

## SDK Client Usage

The generated client uses the `fetch` API, which is available globally on both iOS and Android via the Hermes runtime. No additional HTTP client library (axios, got) is required.

Example usage from application code:

```typescript
import { importCredential } from '../sdk/walletApi';

async function saveCredential(walletId: string, vcJwt: string, sessionToken: string) {
  const result = await importCredential(walletId, { vc: vcJwt }, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  });
  return result;
}
```

The `sessionToken` is managed by the `sessionSlice` in the Zustand store. It is obtained during wallet authentication and persisted in MMKV-encrypted storage.

---

## Environment Configuration

The API base URL and other deployment-specific values are injected at build time via Expo's environment variable system. Required keys are listed in `.env.example`:

```
EXPO_PUBLIC_WALLET_API_BASE_URL=https://wallet.example.com
EXPO_PUBLIC_WALLET_ID=<wallet-uuid>
```

Do not commit `.env` files containing real values. The `.env.example` file documents the required keys with placeholder values only.
