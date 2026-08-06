# Wave 1: Claim Dedupe, OID4VP Error UX, MSW Harness, Verifier Env Checklist

Status: Approved for implementation planning

## Goal

Close four wallet-side backlog items in one implementation wave **without** per-credential `did:key` (separate epic):

1. **B** — Deduplicate claim-reading helpers into one module consumed by issuance and presentation code.
2. **C** — P2 step 18 (partial): Scan/OID4VP error surfacing for Issuer PID auth failures — no Issuer notify channel.
3. **E** — MSW Verifier handler group for `direct_post` integration-style tests.
4. **F** — Production `did:web` Verifier env checklist (docs; trust code already shipped).

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Step 18 scope | Scan OID4VP path only (option A) — extend `toFriendlyError` + existing Scan error phase |
| Issuer notify (diagram step 17) | Out of scope — peer-owned; no deeplink/push intake |
| Claim helper home | `src/services/credentials/claimFormatting.ts` (extracted from `credentialDisplay.ts` internals) |
| Screen files | No changes to `app/(tabs)/*` for dedupe — already use `credentialDisplay` |
| MSW wiring | Opt-in per test file via `mswServer.ts` — not global Jest |
| Verifier production trust | Docs/checklist only — `trustedVerifiers.ts` policy unchanged |
| Per-credential `did:key` | Explicit non-goal (Wave 2) |

## Architecture

```text
claimFormatting.ts  ←── credentialDisplay.ts
                   ←── qrIssuanceFlow.ts
                   ←── presentationService.ts (via readClaimText)
                   ←── dcqlCredentialMatch.ts

scanFriendlyErrors.ts ←── scan.tsx, CredentialOfferClaimScreen (Issuer OID4VP messages)

src/__tests__/setup/
  handlers/verifier.ts
  mswServer.ts        ←── presentationService.test.ts (opt-in)

docs + .env.example   ←── release Verifier did:web checklist (F)
```

---

## B — Claim helper dedupe

### Problem

`stringifyClaim`, `HIDDEN_CLAIM_KEYS`, and claim lookup logic are duplicated across:

- `src/services/credentials/credentialDisplay.ts`
- `src/services/vci/qrIssuanceFlow.ts`
- `src/services/vp/presentationService.ts` (`readClaimValueAsString`)
- `src/services/vp/dcqlCredentialMatch.ts` (`readClaimValueAsString`)

This violates the config-driven UI rule: field definitions live in `cardSchemas.ts`; formatting/lookup is a shared credential concern.

### New module: `claimFormatting.ts`

Export:

```ts
export const HIDDEN_CLAIM_KEYS: ReadonlySet<string>
export function isHiddenClaimKey(key: string): boolean
export function stringifyClaim(value: unknown): string
export function readClaimText(claims: Record<string, unknown>, keys: string[]): string | undefined
```

Behavior (preserve existing):

- `stringifyClaim`: primitives → string; objects/arrays → `JSON.stringify`; null/undefined → `''`
- `readClaimText`: try keys in order; first non-empty trimmed string wins
- `HIDDEN_CLAIM_KEYS`: `vc`, `iss`, `iat`, `nbf`, `exp`, `jti`, `vct`, `cnf`, `status`

### Consumer updates

| File | Change |
|------|--------|
| `credentialDisplay.ts` | Import from `claimFormatting.ts`; remove local copies |
| `qrIssuanceFlow.ts` | Import `readClaimText`, `stringifyClaim`, `isHiddenClaimKey`; remove local helpers |
| `presentationService.ts` | Replace `readClaimValueAsString` with `readClaimText` |
| `dcqlCredentialMatch.ts` | Replace `readClaimValueAsString` with `readClaimText` |

### Tests

- Add `src/services/credentials/claimFormatting.test.ts` covering stringify, hidden keys, alias order lookup
- Existing `credentialDisplay` / `qrIssuanceFlow` / VP tests must pass unchanged

---

## C — P2 step 18: Scan OID4VP error UX

### Scope

Wallet-visible failures during Issuer OID4VP PID presentation on the Scan tab:

- Resolve/trust failures before consent
- Submit failures after Holder approves (`submitPresentationResponse`)
- Missing PID credential for Issuer DCQL request

**Not in scope:** UI after Issuer verifies PID and notifies failure through a separate channel (diagram steps 17–18 peer path).

### `scanFriendlyErrors.ts` additions

Add mappings (English user strings; match existing file style):

| Trigger | Message intent |
|---------|----------------|
| `VerifierUntrusted` when request is issuer-class (optional: detect via message context or add distinct error code `IssuerOid4VpUntrusted` at throw site) | This Issuer is not trusted for PID presentation. Configure `EXPO_PUBLIC_ISSUER_OID4VP_*` env. |
| `PresentationSubmissionFailed` where `response_uri` origin matches Issuer allowlist (or generic if detection is hard) | The Issuer rejected the PID presentation. Try again or contact the Issuer. |
| `PresentationCredentialMissing` with PID-related DCQL | Store Thai National ID (ThaID) before presenting to the Issuer. |
| Existing `PresentationRequestInvalid` | Keep; ensure JAR failures from Issuer requests surface clearly |

**Implementation note:** If issuer vs verifier disambiguation is unreliable at the friendly-error layer, add a narrow error suffix at the throw site in `presentationService.ts` (e.g. `PresentationSubmissionFailed:issuer`) rather than parsing URLs in `toFriendlyError`.

### UI

No new screens. Scan continues to set `phase: { tag: 'error', message: toFriendlyError(raw) }`.

### History (optional, not blocking)

If low-cost: when `client_id` matches Issuer OID4VP allowlist, record `presentation-failed` with `partyName` from Issuer env — defer if it touches many call sites.

### Tests

- Extend `scanFriendlyErrors.test.ts` (create if missing) with new error string cases

---

## E — MSW Verifier harness

### Problem

`walletApiHandlers` and `issuerHandlers` exist under `src/__tests__/setup/handlers/` but are unused. `presentationService.test.ts` uses manual `fetchMock` only. TASKS requests a Verifier handler group for `direct_post` tests.

### New files

**`src/__tests__/setup/handlers/verifier.ts`**

```ts
export const verifierHandlers = [
  http.post('https://issuer.example.com/oid4vp/direct-post', async ({ request }) => {
    const body = await request.text()
    // assert vp_token present; return 200 { status: 'accepted' }
  }),
  // optional: http.post('https://verifier.example.com/oid4vp/direct-post', ...)
]
```

**`src/__tests__/setup/mswServer.ts`**

```ts
import { setupServer } from 'msw/node'
import { walletApiHandlers } from './handlers/walletApi'
import { issuerHandlers } from './handlers/issuer'
import { verifierHandlers } from './handlers/verifier'

export const mswServer = setupServer(...walletApiHandlers, ...issuerHandlers, ...verifierHandlers)
```

### Test integration

- In `presentationService.test.ts`, add one describe block:
  - `beforeAll(() => mswServer.listen())`
  - `afterEach(() => mswServer.resetHandlers())`
  - `afterAll(() => mswServer.close())`
  - Re-run issuer PID DCQL resolve + submit using MSW instead of `fetchMock` for the POST leg
- Keep existing fetch-mock tests — MSW proves harness works; no big-bang migration

### Constraints

- MSW must not ship in production bundles (already devDependency; no app imports)
- Handlers use example.com hosts matching existing test URIs

---

## F — Production Verifier env checklist

Code for production `did:web` verifier trust is implemented per `docs/superpowers/specs/2026-07-09-oid4vp-production-did-web-verifier-design.md`. This slice is **documentation only**.

### Deliverables

1. **`.env.example`** — comment block: release builds require `EXPO_PUBLIC_VERIFIER_DID_WEB_CLIENT_ID` + `EXPO_PUBLIC_VERIFIER_DID_WEB_RESPONSE_ORIGIN`; do not rely on `EXPO_PUBLIC_VERIFIER_API_BASE_URL` outside `__DEV__`.
2. **`docs/GETTING_STARTED.md`** (or short subsection in TESTING.md) — numbered release checklist:
   - Configure Verifier did:web env vars
   - Confirm dev `redirect_uri` entry absent in release profile
   - Golden-path: Scan signed JAR QR from production Verifier
3. **`docs/TASKS.md`** — update OID4VP item 348 with pointer to checklist; note env docs complete, E2E still needs customer Verifier host

---

## Error handling

- Claim formatting: no throws for malformed claim values — empty string fallback
- MSW: test-only; failures surface as existing `PresentationSubmissionFailed` paths
- Friendly errors: log raw error via existing `logWalletError` at Scan catch sites before mapping (already present)

## Testing summary

| Area | Command / file |
|------|----------------|
| Claim formatting | `yarn test src/services/credentials/claimFormatting.test.ts` |
| Friendly errors | `yarn test scanFriendlyErrors` |
| MSW harness | `yarn test presentationService.test.ts` |
| Regression | `yarn tsc --noEmit`, `yarn lint` |

## Non-goals

- Per-credential `did:key` (ADR 0010 epic)
- Trust Registry / Issuer notify channel for PID failure
- Thai localization pass for all Scan errors (English only per project rules for new strings unless existing Thai pattern on same screen)
- Global MSW in `jest.setup.ts`
- Refactoring `readFriendlyCredentialName` in `qrIssuanceFlow.ts` into cardSchemas (separate cleanup)

## TASKS.md updates (post-implementation)

- Mark advisory dedupe item `[x]`
- Mark MSW Verifier handler `[x]` or note partial if only harness + one test
- Session note for Wave 1 slice
- Step 18 canvas note: Scan OID4VP issuer errors surfaced (peer notify still pending)
