# Claim Credential Design

## Goal

Implement Phase 2.3 Credential Acquisition for the OID4VCI wallet with a `claimCredential()` service function.

## Scope

`claimCredential()` claims one JWT VC from an Issuer using a previously resolved `ResolvedCredentialOffer`. It supports OID4VCI 1.0 Pre-Authorized Code flow only, requires caller-supplied `tx_code` when the offer declares one, signs PoP through the hardware-backed `signProof()` path, stores the normalized credential locally in encrypted MMKV, and returns the stored `VerifiableCredentialRecord`.

Authorization Code flow, non-JWT credential formats, backend sync, issuer signature validation, UI prompts, and executable Jest tests are out of scope for this phase.

## Public API

```ts
export type VerifiableCredentialRecord = {
  id: string
  type: string
  rawVc: string
  claims: Record<string, unknown>
  issuedAt: string
  expiresAt?: string
}

export type ClaimCredentialOptions = {
  tx_code?: string
}

export async function claimCredential(
  resolvedOffer: ResolvedCredentialOffer,
  options?: ClaimCredentialOptions,
): Promise<VerifiableCredentialRecord>
```

## Data Flow

1. Caller resolves an offer with `resolveOffer()`.
2. Caller prompts for `tx_code` if `resolvedOffer.txCode` exists.
3. `claimCredential()` rejects offers without `preAuthorizedCode` as `CredentialFlowUnsupported`.
4. `claimCredential()` rejects missing required `tx_code` as `TransactionCodeRequired`.
5. Sphereon performs the Pre-Authorized Code token exchange and credential request.
6. The service obtains `c_nonce`, calls `signProof(c_nonce, resolvedOffer.issuer)`, and passes the resulting JWT proof into the credential request.
7. The service accepts JWT VC credential responses only.
8. The JWT payload is decoded into untrusted display/index data.
9. The service normalizes into `VerifiableCredentialRecord`.
10. The record is stored in encrypted MMKV under `credential:<id>`, and `credential:index` is updated without duplicate IDs.
11. The stored record is returned. Access token and `c_nonce` stay inside the service.

## Normalization Rules

`id` uses VC `jti`, then VC `id`, then deterministic hash of raw VC JWT.

`type` uses VC claims: prefer the most specific `vc.type` array entry, then top-level `type`, then `VerifiableCredential`.

`claims` stores the full decoded JWT payload.

`issuedAt` normalizes to ISO 8601. Source priority is `vc.issuanceDate`, then `iat`, then `nbf`, then current time.

`expiresAt` normalizes to ISO 8601 when `vc.expirationDate` or `exp` exists.

## Error Policy

Use stable prefixed `Error` messages:

- `TransactionCodeRequired`
- `CredentialFlowUnsupported`
- `CredentialFormatUnsupported`
- `CredentialTokenExchangeFailed`
- `CredentialRequestFailed`
- `CredentialJwtInvalid`
- `CredentialStorageFailed`

## Testing

Jest is not installed. Extend `src/services/vci/exchangeService.test.ts` as a TypeScript contract test compiled by `yarn tsc`. Use dependency injection for protocol, signer, and storage fakes so contract tests do not call network, biometrics, or native MMKV.

## Documentation

After implementation, mark completed Phase 2.3 checklist items in `docs/TASKS.md`, keep backend sync unchecked, then run `yarn tsc` and `yarn lint`.
