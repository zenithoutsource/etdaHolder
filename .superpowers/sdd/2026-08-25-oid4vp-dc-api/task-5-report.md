# Task 5 Report — DC API response builder

## Implementation

- Added `src/services/vp/dcApi/dcApiResponseBuilder.ts`.
- `dc_api` returns the DCQL `object_array` envelope as `{ data: { vp_token } }`.
- `dc_api.jwt` resolves the existing verifier encryption parameters and returns only a compact ECDH-ES JWE. Its encrypted JSON payload contains exactly `{ vp_token }`; it never includes `state`.
- Reused `formatDcqlVpTokenEnvelope`, `resolveOid4vpResponseEncryptionParams`, and `encryptCompactJweEcdhEsP256`. No response-encryption changes were needed because the resolver was already exported.

## TDD evidence

1. Added the focused tests before the production module.
2. RED command:

   ```text
   cmd.exe /d /c "yarn.cmd test src/services/vp/dcApi/dcApiResponseBuilder.test.ts --no-cache --runInBand"
   ```

   Result: failed as expected because `./dcApiResponseBuilder` did not exist.

3. GREEN command:

   ```text
   cmd.exe /d /c "yarn.cmd test src/services/vp/dcApi/dcApiResponseBuilder.test.ts --no-cache --runInBand"
   ```

   Result: PASS — 1 suite, 2 tests.

## Verification

```text
cmd.exe /d /c "yarn.cmd test src/services/vp/dcApi/dcApiResponseBuilder.test.ts src/services/vp/oid4vpResponseEncryption.test.ts src/services/vp/oid4vc/formatDcqlVpTokenEnvelope.test.ts src/services/vp/directPostFormBody.test.ts --no-cache --runInBand"
```

Result: PASS — 4 suites, 25 tests. This includes direct-post response-mode and shared encryption/envelope regressions.

```text
cmd.exe /d /c "yarn.cmd tsc --noEmit"
```

Result: completed with no diagnostics.

```text
cmd.exe /d /c "node_modules\\.bin\\eslint.cmd src/services/vp/dcApi/dcApiResponseBuilder.ts src/services/vp/dcApi/dcApiResponseBuilder.test.ts"
```

Result: completed with no diagnostics.

An additional full `yarn.cmd test --runInBand` invocation was started for branch verification, but the local shell detached it without returning an exit result. It is not used as evidence in this report; the focused verification above is the recorded Task 5 result.
