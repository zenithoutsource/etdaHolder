# Renewal Receive Test Timeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the timing-sensitive combined renewal-receive test while preserving all passive-focus and explicit-claim assertions under Jest's existing five-second timeout.

**Architecture:** Change only the test structure. Split one test containing two sequential asynchronous phases into two focused tests with independently reset mocks and per-test timeout budgets; do not modify product code, mocks, or Jest configuration.

**Tech Stack:** Jest 29, React Native Testing Library, TypeScript, React Native 0.81, Expo SDK 54.

## Global Constraints

- Modify only `src/screens/CredentialDetailRenewalReceive.test.tsx` for the repair.
- Do not change credential-detail production code.
- Do not increase global, file-level, or per-test Jest timeouts.
- Do not weaken assertions or remove coverage.
- Do not refactor unrelated renewal tests or mocks.
- Keep the passive-focus test first so cold initialization does not share a test budget with the explicit receive interaction.
- Clear `mockRefresh` after focus settles in the explicit receive test so its final assertion proves post-claim refresh.
- Preserve unrelated working-tree changes and stage only the test file in the implementation commit.

---

### Task 1: Split passive focus from explicit receive

**Files:**
- Modify: `src/screens/CredentialDetailRenewalReceive.test.tsx:125-141`
- Test: `src/screens/CredentialDetailRenewalReceive.test.tsx`

**Interfaces:**
- Consumes: existing `mockRenewalStatus`, `mockRefreshAndCompleteRenewals`, `mockClaimReadyRenewal`, `mockRefresh`, `render`, `screen`, `fireEvent`, and `waitFor` test fixtures.
- Produces: two tests named `keeps renewal-ready detail focus passive` and `claims a ready renewal only after the Holder presses Receive new document`.

- [ ] **Step 1: Reconfirm the recorded failing baseline**

Run from the isolated worktree:

```powershell
yarn.cmd test --runInBand --silent --no-cache --testMatch "**/src/screens/CredentialDetailRenewalReceive.test.tsx"
```

Expected evidence: the existing combined test has already failed twice with `Exceeded timeout of 5000 ms`, once in the complete mobile suite and once in a focused file run. A warm rerun may pass, which confirms timing sensitivity rather than invalidating the recorded failing baseline.

- [ ] **Step 2: Replace the combined test with two focused tests**

Replace lines 125–141 with exactly:

```typescript
  test('keeps renewal-ready detail focus passive', async () => {
    mockRenewalStatus = { ...mockRenewalStatus!, readyOfferUri: '  openid-credential-offer://ready  ' }

    render(<CredentialDetailScreen />)

    await waitFor(() => {
      expect(mockRefreshAndCompleteRenewals).toHaveBeenCalled()
    })
    expect(mockClaimReadyRenewal).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Receive new document' })).toBeTruthy()
  })

  test('claims a ready renewal only after the Holder presses Receive new document', async () => {
    mockRenewalStatus = { ...mockRenewalStatus!, readyOfferUri: '  openid-credential-offer://ready  ' }

    render(<CredentialDetailScreen />)

    await waitFor(() => {
      expect(mockRefreshAndCompleteRenewals).toHaveBeenCalled()
    })
    mockRefresh.mockClear()

    fireEvent.press(screen.getByRole('button', { name: 'Receive new document' }))

    await waitFor(() => {
      expect(mockClaimReadyRenewal).toHaveBeenCalledWith('credential-1')
      expect(mockRefresh).toHaveBeenCalled()
    })
  })
```

- [ ] **Step 3: Verify the focused file without Jest cache**

Run:

```powershell
yarn.cmd test --runInBand --silent --no-cache --testMatch "**/src/screens/CredentialDetailRenewalReceive.test.tsx"
```

Expected: one suite passes with seven tests and no timeout override.

- [ ] **Step 4: Verify the focused file with normal cache behavior**

Run:

```powershell
yarn.cmd test --runInBand --silent --testMatch "**/src/screens/CredentialDetailRenewalReceive.test.tsx"
```

Expected: one suite passes with seven tests.

- [ ] **Step 5: Run the complete mobile Jest suite**

Run:

```powershell
yarn.cmd test --runInBand --silent --testMatch "**/src/**/*.test.ts" --testMatch "**/src/**/*.test.tsx" --testMatch "**/scripts/**/*.test.js" --testPathIgnorePatterns "server"
```

Expected: all 140 mobile suites and 751 tests pass, or the updated repository totals pass if unrelated tests have been added.

- [ ] **Step 6: Run repository checks**

Run:

```powershell
yarn.cmd tsc --noEmit
yarn.cmd lint
git diff --check -- src/screens/CredentialDetailRenewalReceive.test.tsx
```

Expected: TypeScript exits 0; lint exits 0 with only documented existing warnings; diff check emits no errors.

- [ ] **Step 7: Commit only the test repair**

```powershell
git add -- src/screens/CredentialDetailRenewalReceive.test.tsx
git commit -m "test: split renewal receive interaction"
```

Expected: the implementation commit contains only `src/screens/CredentialDetailRenewalReceive.test.tsx`.
