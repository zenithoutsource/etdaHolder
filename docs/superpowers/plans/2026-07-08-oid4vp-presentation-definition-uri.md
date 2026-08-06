# OID4VP `presentation_definition_uri` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch Presentation Definitions by URL for trusted OID4VP Verifiers while preserving the P5 ThaiNationalID birth-date-only Presentation Exchange slice.

**Architecture:** New `presentationDefinitionResolver.ts` owns fetch + trust gate + JSON parse. `resolvePresentationRequest()` resolves PD **after** `findTrustedVerifier()`. Existing descriptor parsers and `assertSupportedBirthDateRequest()` stay in `presentationService.ts` (exported or shared via thin import).

**Tech Stack:** Expo SDK 54, Hermes, Jest, existing `presentationService` types, wallet `fetchImpl` adapter (dev verifier proxy compatible).

**Spec:** `docs/superpowers/specs/2026-07-08-oid4vp-presentation-definition-uri-design.md`

## Global Constraints

- Fetch **only after** `findTrustedVerifier()` returns a trusted entry.
- URI `origin` must be in `verifier.allowedOrigins`.
- HTTPS required when `!__DEV__`; `http:` allowed in `__DEV__` for LAN testing.
- Reject requests with **both** `presentation_definition` and `presentation_definition_uri`.
- Reject any Presentation Exchange parameter (`presentation_definition` or `presentation_definition_uri`) combined with `dcql_query`.
- Fetch timeout via `EXPO_PUBLIC_PRESENTATION_DEFINITION_FETCH_TIMEOUT_MS` (default 15_000 ms); max body via `EXPO_PUBLIC_PRESENTATION_DEFINITION_MAX_BYTES` (default 65_536).
- Map malformed URI, timeout, oversize, and network errors to stable wallet-domain errors (see spec error table).
- Post-fetch: run `assertSupportedBirthDateRequest()` — no new claim paths in v1.
- No logging of PD body, claim values, or tokens — use `logWalletStep` with host + status only.
- Run `yarn tsc --noEmit`, focused tests after each task; update `docs/TASKS.md` when complete.
- Do not commit unless the user explicitly requests.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/config/presentationDefinitionFetchPolicy.ts` | **Create** — timeout + max-bytes env defaults |
| `src/services/vp/presentationDefinitionResolver.ts` | **Create** — origin/HTTPS gate, fetch, parse entrypoint |
| `src/services/vp/presentationService.ts` | **Modify** — reorder PD resolution; export/share parse helper |
| `src/services/vp/presentationService.test.ts` | **Modify** — `presentation_definition_uri` integration test |
| `docs/TASKS.md` | **Modify** — mark checkbox `[x]` |

---

### Task 1: Presentation definition resolver (fetch + trust gate)

**Files:**
- Create: `src/services/vp/presentationDefinitionResolver.ts`
- Create: `src/services/vp/presentationDefinitionResolver.test.ts`
- Modify: `src/services/vp/presentationService.ts` (export `parsePresentationDefinitionJson` helper)

**Interfaces:**
- Produces: `fetchPresentationDefinition(uri: string, options: { allowedOrigins: string[]; fetchImpl?: typeof fetch }): Promise<PresentationDefinition>`

- [ ] **Step 1: Write failing resolver tests**

```typescript
// src/services/vp/presentationDefinitionResolver.test.ts
import { fetchPresentationDefinition } from './presentationDefinitionResolver'

const presentationDefinition = {
  id: 'age-over-20',
  input_descriptors: [
    {
      id: 'thai-id-age',
      constraints: { fields: [{ path: ['$.birthDate'] }] },
    },
  ],
}

describe('presentationDefinitionResolver', () => {
  test('fetches presentation definition from allowlisted origin', async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(presentationDefinition), { status: 200 }),
    )

    await expect(
      fetchPresentationDefinition('https://verifier.example.com/pd/age-over-20.json', {
        allowedOrigins: ['https://verifier.example.com'],
        fetchImpl: fetchMock as unknown as typeof fetch,
      }),
    ).resolves.toEqual(presentationDefinition)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://verifier.example.com/pd/age-over-20.json',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    )
  })

  test('rejects off-origin presentation_definition_uri', async () => {
    await expect(
      fetchPresentationDefinition('https://evil.example.com/pd.json', {
        allowedOrigins: ['https://verifier.example.com'],
      }),
    ).rejects.toThrow('PresentationDefinitionUntrusted')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `yarn test --runInBand src/services/vp/presentationDefinitionResolver.test.ts`  
Expected: FAIL — module not found

- [ ] **Step 3: Implement resolver**

```typescript
// src/services/vp/presentationDefinitionResolver.ts
import { logWalletStep } from '../debug/walletLogger'
import { parsePresentationDefinitionJson, type PresentationDefinition } from './presentationService'

export async function fetchPresentationDefinition(
  uri: string,
  options: { allowedOrigins: string[]; fetchImpl?: typeof fetch },
): Promise<PresentationDefinition> {
  const parsed = new URL(uri)
  assertPresentationDefinitionUriPolicy(parsed)

  if (!options.allowedOrigins.includes(parsed.origin)) {
    throw new Error('PresentationDefinitionUntrusted: URI origin is not allowlisted')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  logWalletStep('oid4vp', 'fetch-presentation-definition-start', {
    host: parsed.host,
    origin: parsed.origin,
  })

  const response = await fetchImpl(uri, { headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`PresentationDefinitionFetchFailed: HTTP ${response.status}`)
  }

  const text = await response.text()
  logWalletStep('oid4vp', 'fetch-presentation-definition-complete', {
    host: parsed.host,
    status: response.status,
    bytes: text.length,
  })

  return parsePresentationDefinitionJson(text)
}

function assertPresentationDefinitionUriPolicy(url: URL): void {
  if (url.protocol === 'https:') return
  if (__DEV__ && url.protocol === 'http:') return
  throw new Error('PresentationDefinitionUntrusted: presentation definition URI must use HTTPS')
}
```

- [ ] **Step 4: Extract `parsePresentationDefinitionJson` from `presentationService.ts`**

Refactor existing inline `presentation_definition` JSON.parse block into exported:

```typescript
export function parsePresentationDefinitionJson(text: string): PresentationDefinition {
  // move body from readOptionalPresentationDefinition inline branch
}
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `yarn test --runInBand src/services/vp/presentationDefinitionResolver.test.ts`  
Expected: PASS

---

### Task 2: Wire resolver into `resolvePresentationRequest`

**Files:**
- Modify: `src/services/vp/presentationService.ts`
- Test: `src/services/vp/presentationService.test.ts`

**Interfaces:**
- Consumes: `fetchPresentationDefinition()` from Task 1
- Produces: unchanged `ResolvedPresentationRequest` shape

- [ ] **Step 1: Write failing integration test**

```typescript
// presentationService.test.ts — add test
test('resolves presentation_definition_uri after trusting the verifier', async () => {
  const fetchMock = jest.fn(async (input: RequestInfo) => {
    const url = String(input)
    if (url.includes('/pd/age-over-20.json')) {
      return new Response(JSON.stringify(presentationDefinition), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  })

  const request = await resolvePresentationRequest(
    authorizationRequestUri({ presentation_definition: undefined, presentation_definition_uri: 'https://verifier.example.com/pd/age-over-20.json' }),
    [thaiIdRecord],
    {
      fetchImpl: fetchMock as unknown as typeof fetch,
      trustedVerifiers: [
        {
          clientId: 'did:web:verifier.example.com',
          name: 'Entertainment Venue',
          allowedOrigins: ['https://verifier.example.com'],
        },
      ],
    },
  )

  expect(request.matchedCredential.id).toBe('thai-id-1')
  expect(fetchMock).toHaveBeenCalledWith(
    'https://verifier.example.com/pd/age-over-20.json',
    expect.objectContaining({ headers: { Accept: 'application/json' } }),
  )
})
```

Adjust `authorizationRequestUri()` helper to omit inline `presentation_definition` when URI is used.

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test --runInBand src/services/vp/presentationService.test.ts -t presentation_definition_uri`  
Expected: FAIL — unsupported or wrong order

- [ ] **Step 3: Reorder `resolvePresentationRequest`**

```typescript
// After findTrustedVerifier succeeds:
const presentationDefinition = await resolvePresentationDefinitionFromRequest(
  authorizationRequest,
  verifier,
  options.fetchImpl ?? fetch,
)

async function resolvePresentationDefinitionFromRequest(
  request: JsonRecord,
  verifier: TrustedVerifier,
  fetchImpl: typeof fetch,
): Promise<PresentationDefinition | undefined> {
  const inline = readString(request.presentation_definition)
  const uri = readString(request.presentation_definition_uri)

  if (inline && uri) {
    throw new Error('PresentationRequestInvalid: presentation_definition and presentation_definition_uri are mutually exclusive')
  }
  if (inline) return parsePresentationDefinitionJson(inline)
  if (uri) {
    return fetchPresentationDefinition(uri, {
      allowedOrigins: verifier.allowedOrigins,
      fetchImpl,
    })
  }
  return undefined
}
```

Remove old throw in `readOptionalPresentationDefinition` for URI; keep function for inline-only or delete if unused.

- [ ] **Step 4: Run integration + existing presentationService tests**

Run: `yarn test --runInBand src/services/vp/presentationService.test.ts`  
Expected: all PASS

---

### Task 3: Docs and verification

**Files:**
- Modify: `docs/TASKS.md`

- [ ] **Step 1: Mark TASKS.md checkbox**

```markdown
[x] `presentation_definition_uri` fetch support — `presentationDefinitionResolver.ts`; fetch after trust gate; P5 birth-date scope unchanged.
```

- [ ] **Step 2: Run full quality gates**

Run:
```bash
yarn tsc --noEmit
yarn test --runInBand src/services/vp/presentationDefinitionResolver.test.ts src/services/vp/presentationService.test.ts
yarn lint
```

Expected: pass (lint may show pre-existing warnings only).

---

## Plan self-review

| Spec requirement | Task |
|------------------|------|
| Fetch after trust | Task 2 reorder |
| Origin allowlist | Task 1 resolver |
| HTTPS policy | Task 1 `assertPresentationDefinitionUriPolicy` |
| Mutual exclusion inline/URI | Task 2 orchestrator |
| PE + DCQL mutual exclusion | Task 2 `assertMutuallyExclusiveQueryLanguages` |
| Fetch timeout + max bytes | Task 1 resolver + `presentationDefinitionFetchPolicy.ts` |
| Error mapping (URI/network/timeout/oversize) | Task 1 resolver |
| P5 assert after fetch | Task 2 uses existing `assertSupportedBirthDateRequest` |
| Tests | Tasks 1–2 |
| TASKS.md | Task 3 |

No placeholders remain.
