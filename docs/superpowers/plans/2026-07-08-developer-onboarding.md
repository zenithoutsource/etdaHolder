# Developer Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new developer reach Wallet home on a physical Android device in ~30 minutes with `yarn setup` and at most two minimal env files — no bloated `.env.example`.

**Architecture:** Split required vs optional env into committed example files; add `scripts/detectLanIp.js` + `scripts/setup-dev-env.js` for idempotent env generation; fix backend URL default port mismatch; document the golden path in `docs/GETTING_STARTED.md`.

**Tech Stack:** Node.js (`os.networkInterfaces`), Yarn, Expo SDK 54 env loading, existing Jest test runner.

**Spec:** `docs/superpowers/specs/2026-07-08-developer-onboarding-design.md`

## Global Constraints

- Never overwrite existing `.env` or `server/.env` without `--force`.
- Idempotent reruns: skip existing env files with notice, exit `0`.
- Minimal mobile `.env`: `EXPO_PUBLIC_WALLET_API_BASE_URL`, `EXPO_PUBLIC_SKIP_PUSH_REGISTRATION=true` only.
- Minimal `server/.env`: 8 vars (`PORT`, `DB_*`, `JWT_SECRET`, `JWT_EXPIRES_IN`).
- `DEFAULT_WALLET_API_BASE_URL` → `http://localhost:4000`.
- `--yes` with no LAN candidate → `http://localhost:4000` + warning, exit `0`.
- `yarn setup` exit codes: `0` success, `1` user abort, `3` unrecoverable `--yes` write failure.
- `yarn setup --check` exit codes: `0` all pass, `1` any fail.
- `.env.development.local.example` is committable; `.env.development.local` stays gitignored (`.gitignore` line 35).
- NativeWind / existing code style; no unrelated refactors.

---

## File map

| File | Responsibility |
|------|----------------|
| `scripts/detectLanIp.js` | Pure LAN IPv4 candidate selection from `os.networkInterfaces()` |
| `scripts/detectLanIp.test.js` | Unit tests with mocked interfaces |
| `scripts/setup-dev-env.js` | CLI: write env files, `--yes`, `--force`, `--check` |
| `scripts/setup-dev-env.test.js` | Temp-dir integration tests for write/skip/check |
| `.env.example` | Pointer to `yarn setup` + optional file |
| `.env.development.local.example` | All optional mobile vars (migrated from old `.env.example`) |
| `server/.env.example` | Pointer + minimal template |
| `server/.env.development.local.example` | Optional server vars (migrated from old `server/.env.example`) |
| `src/sdk/installWalletApiFetch.ts` | Default port 4000 |
| `docs/GETTING_STARTED.md` | 30-minute checklist |
| `README.md`, `server/README.md` | Link to getting started |
| `package.json` | `"setup"` script |

---

### Task 1: LAN IP detection helper

**Files:**
- Create: `scripts/detectLanIp.js`
- Create: `scripts/detectLanIp.test.js`

**Interfaces:**
- Produces: `detectLanIp(options?)` → `string | null` (first private IPv4 candidate, or `null`)
- Produces: `isVirtualInterfaceName(name)` → `boolean`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/detectLanIp.test.js
const { detectLanIp, isVirtualInterfaceName } = require('./detectLanIp');

describe('isVirtualInterfaceName', () => {
  it('flags VPN and virtual adapters', () => {
    expect(isVirtualInterfaceName('vEthernet (WSL)')).toBe(true);
    expect(isVirtualInterfaceName('OpenVPN TAP-Windows6')).toBe(true);
    expect(isVirtualInterfaceName('Wi-Fi')).toBe(false);
  });
});

describe('detectLanIp', () => {
  it('prefers private IPv4 on a non-virtual interface', () => {
    const ip = detectLanIp({
      networkInterfaces: () => ({
        'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.1.42' }],
        'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.24.0.1' }],
      }),
    });
    expect(ip).toBe('192.168.1.42');
  });

  it('returns null when only virtual adapters exist', () => {
    const ip = detectLanIp({
      networkInterfaces: () => ({
        'OpenVPN TAP': [{ family: 'IPv4', internal: false, address: '10.8.0.2' }],
      }),
    });
    expect(ip).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn test scripts/detectLanIp.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement minimal helper**

```javascript
// scripts/detectLanIp.js
const os = require('os');

const VIRTUAL_NAME_PATTERN = /virtual|vpn|tap|tun|wsl|hyper-v|loopback|vethernet|docker|vmware|npcap/i;

function isVirtualInterfaceName(name) {
  return VIRTUAL_NAME_PATTERN.test(name);
}

function isPrivateIpv4(address) {
  if (address.startsWith('10.')) return true;
  if (address.startsWith('192.168.')) return true;
  const parts = address.split('.').map(Number);
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function detectLanIp(options = {}) {
  const networkInterfaces = options.networkInterfaces ?? os.networkInterfaces;
  const interfaces = networkInterfaces();

  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (isVirtualInterfaceName(name)) continue;
    for (const entry of entries ?? []) {
      const family = entry.family === 'IPv4' || entry.family === 4;
      if (!family || entry.internal) continue;
      if (!isPrivateIpv4(entry.address)) continue;
      candidates.push({ name, address: entry.address });
    }
  }

  // Prefer 192.168.x (typical home/office Wi-Fi), then other private ranges
  candidates.sort((a, b) => {
    const score = (addr) => (addr.startsWith('192.168.') ? 0 : addr.startsWith('10.') ? 1 : 2);
    return score(a.address) - score(b.address);
  });

  return candidates[0]?.address ?? null;
}

module.exports = { detectLanIp, isVirtualInterfaceName, isPrivateIpv4 };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn test scripts/detectLanIp.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/detectLanIp.js scripts/detectLanIp.test.js
git commit -m "feat(setup): add LAN IP detection helper for dev env bootstrap"
```

---

### Task 2: `yarn setup` script

**Files:**
- Create: `scripts/setup-dev-env.js`
- Create: `scripts/setup-dev-env.test.js`
- Modify: `package.json` (add `"setup"` script)

**Interfaces:**
- Consumes: `detectLanIp` from `./detectLanIp`
- Produces: CLI `node scripts/setup-dev-env.js [--yes] [--force] [--check]`

- [ ] **Step 1: Write failing integration test (temp dir)**

```javascript
// scripts/setup-dev-env.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.join(__dirname, 'setup-dev-env.js');

function runSetup(args, cwd) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, SETUP_TEST_LAN_IP: '192.168.50.10' },
  });
}

describe('setup-dev-env', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'etda-setup-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes .env and server/.env on first run', () => {
    fs.mkdirSync(path.join(tmpDir, 'server'));
    const result = runSetup(['--yes'], tmpDir);
    expect(result.status).toBe(0);
    const rootEnv = fs.readFileSync(path.join(tmpDir, '.env'), 'utf8');
    expect(rootEnv).toContain('EXPO_PUBLIC_WALLET_API_BASE_URL=http://192.168.50.10:4000');
    expect(rootEnv).toContain('EXPO_PUBLIC_SKIP_PUSH_REGISTRATION=true');
    expect(rootEnv).not.toContain('EXPO_PUBLIC_ENABLE_WALLET_DEBUG_LOGS');
    const serverEnv = fs.readFileSync(path.join(tmpDir, 'server', '.env'), 'utf8');
    expect(serverEnv).toContain('PORT=4000');
    expect(serverEnv).toMatch(/JWT_SECRET=.+/);
  });

  it('skips existing files and exits 0', () => {
    fs.mkdirSync(path.join(tmpDir, 'server'));
    fs.writeFileSync(path.join(tmpDir, '.env'), 'EXISTING=1\n');
    const result = runSetup(['--yes'], tmpDir);
    expect(result.status).toBe(0);
    expect(fs.readFileSync(path.join(tmpDir, '.env'), 'utf8')).toBe('EXISTING=1\n');
    expect(result.stdout || result.stderr).toMatch(/skip/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `yarn test scripts/setup-dev-env.test.js`

- [ ] **Step 3: Implement `setup-dev-env.js`**

Key behaviors to implement:

```javascript
#!/usr/bin/env node
// scripts/setup-dev-env.js — outline; implement fully in file

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { detectLanIp } = require('./detectLanIp');

const projectRoot = path.resolve(__dirname, '..');
const rootEnvPath = path.join(projectRoot, '.env');
const serverEnvPath = path.join(projectRoot, 'server', '.env');

function buildRootEnv(baseUrl) {
  return [
    `EXPO_PUBLIC_WALLET_API_BASE_URL=${baseUrl}`,
    'EXPO_PUBLIC_SKIP_PUSH_REGISTRATION=true',
    '',
  ].join('\n');
}

function buildServerEnv(jwtSecret) {
  return [
    'PORT=4000',
    'DB_HOST=127.0.0.1',
    'DB_PORT=3306',
    'DB_NAME=etda_wallet',
    'DB_USER=root',
    'DB_PASSWORD=',
    `JWT_SECRET=${jwtSecret}`,
    'JWT_EXPIRES_IN=7d',
    '',
  ].join('\n');
}

function writeIfMissing(filePath, content, force) {
  if (fs.existsSync(filePath) && !force) {
    console.log(`⏭  Skipped ${path.relative(projectRoot, filePath)} (already exists; use --force to overwrite)`);
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓  Wrote ${path.relative(projectRoot, filePath)}`);
  return true;
}

async function resolveBaseUrl({ yes }) {
  const testIp = process.env.SETUP_TEST_LAN_IP;
  const detected = testIp ?? detectLanIp();
  if (!yes && process.stdin.isTTY) {
    // prompt: use detected or type IP; Enter accepts default
  }
  if (detected) return `http://${detected}:4000`;
  console.warn('⚠  No LAN IP detected; using http://localhost:4000. For physical devices, set EXPO_PUBLIC_WALLET_API_BASE_URL manually or use adb reverse.');
  return 'http://localhost:4000';
}

async function runCheck() {
  let ok = true;
  if (!fs.existsSync(rootEnvPath)) { console.error('✗ Missing .env'); ok = false; }
  if (!fs.existsSync(serverEnvPath)) { console.error('✗ Missing server/.env'); ok = false; }
  // optional: TCP connect 127.0.0.1:3306 and fetch http://localhost:4000/health or known route
  process.exit(ok ? 0 : 1);
}

// parse --yes --force --check; call resolveBaseUrl; writeIfMissing both files; print next steps; exit 0
```

Wire `package.json`:

```json
"setup": "node scripts/setup-dev-env.js"
```

Honor `SETUP_TEST_LAN_IP` in test env inside `resolveBaseUrl` before calling `detectLanIp()`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `yarn test scripts/detectLanIp.test.js scripts/setup-dev-env.test.js`

- [ ] **Step 5: Manual smoke**

Run: `yarn setup --yes` on dev machine (or dry-run in temp dir only if `.env` exists)
Expected: skip notice or write two files

- [ ] **Step 6: Commit**

```bash
git add scripts/setup-dev-env.js scripts/setup-dev-env.test.js package.json
git commit -m "feat(setup): add yarn setup for minimal dev env generation"
```

---

### Task 3: Env file split

**Files:**
- Modify: `.env.example`
- Create: `.env.development.local.example` (move optional content from current `.env.example`)
- Modify: `server/.env.example`
- Create: `server/.env.development.local.example` (move optional content from current `server/.env.example`)

**Interfaces:**
- Produces: committable optional-var reference files; slim pointer `.env.example` files

- [ ] **Step 1: Create `.env.development.local.example`**

Move lines 3–77 from current `.env.example` into this file. Add header:

```env
# Optional development overrides — copy to .env.development.local (gitignored).
# NOT required for first run. See docs/GETTING_STARTED.md.
```

Add bold warning above `EXPO_PUBLIC_DISABLE_SD_JWT_KB_FOR_TESTING` and similar dev-weakening flags: **Never enable for release builds.**

- [ ] **Step 2: Replace root `.env.example` with pointer**

```env
# Run: yarn setup
# That writes a minimal .env (backend URL + skip push registration).
#
# Optional dev overrides: copy .env.development.local.example → .env.development.local
# Full guide: docs/GETTING_STARTED.md
```

- [ ] **Step 3: Create `server/.env.development.local.example`**

Move SMTP, dev proxies, VP relay, mDOC vars from current `server/.env.example` (lines 10–43).

- [ ] **Step 4: Replace `server/.env.example` with minimal template + pointer**

```env
# Run: yarn setup   (from repo root — writes server/.env)
# Or copy these lines manually:

PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=etda_wallet
DB_USER=root
DB_PASSWORD=
JWT_SECRET=local-dev-change-me
JWT_EXPIRES_IN=7d

# Optional: see server/.env.development.local.example
```

- [ ] **Step 5: Verify `.gitignore`**

Confirm `.env*.local` ignores `.env.development.local` but not `.env.development.local.example`. No change expected.

- [ ] **Step 6: Commit**

```bash
git add .env.example .env.development.local.example server/.env.example server/.env.development.local.example
git commit -m "docs(setup): split required vs optional env examples"
```

---

### Task 4: Backend URL default port fix

**Files:**
- Modify: `src/sdk/installWalletApiFetch.ts:11`
- Modify: `src/sdk/installWalletApiFetch.test.ts` (if tests assert `3001`)

**Interfaces:**
- Consumes: none
- Produces: `DEFAULT_WALLET_API_BASE_URL = 'http://localhost:4000'`

- [ ] **Step 1: Update constant**

```typescript
const DEFAULT_WALLET_API_BASE_URL = 'http://localhost:4000'
```

- [ ] **Step 2: Fix any failing tests**

Run: `yarn test src/sdk/installWalletApiFetch.test.js`
Update expectations from `3001` → `4000` if present.

- [ ] **Step 3: Commit**

```bash
git add src/sdk/installWalletApiFetch.ts src/sdk/installWalletApiFetch.test.ts
git commit -m "fix(sdk): align default wallet API base URL port with local server (4000)"
```

---

### Task 5: Getting Started documentation

**Files:**
- Create: `docs/GETTING_STARTED.md`
- Modify: `README.md`
- Modify: `server/README.md`
- Modify: `docs/TASKS.md` (session note)

- [ ] **Step 1: Write `docs/GETTING_STARTED.md`**

Sections (from spec):

1. Prerequisites
2. `yarn install` → `yarn setup`
3. XAMPP MySQL + migrations (copy PowerShell from `server/README.md` lines 27–40)
4. `cd server && yarn install && yarn dev`
5. `yarn android:dev` (physical device; LAN IP vs `adb reverse tcp:4000 tcp:4000`)
6. Register → PIN → Wallet home (empty OK)
7. Troubleshooting (3–5 bullets)
8. Advanced → `.env.development.local.example`, `docs/ANDROID_NETWORK_TESTING.md`

Note the zero-env side benefit: with default port 4000 + `resolveNativeDevLoopbackBaseUrl`, `http://localhost:4000` can work on USB + `adb reverse` without LAN IP.

- [ ] **Step 2: Update `README.md` Environment section**

Replace manual `.env` block with link to `docs/GETTING_STARTED.md`.

- [ ] **Step 3: Update `server/README.md` setup step 3**

Change "Create `server/.env` from `server/.env.example`" → "Run `yarn setup` from repo root".

- [ ] **Step 4: Add `docs/TASKS.md` session bullet**

Under Session 2026-07-08 (or new date when implemented):

```markdown
- **Developer onboarding** — `yarn setup`, slim `.env.example`, `docs/GETTING_STARTED.md`. Spec: `docs/superpowers/specs/2026-07-08-developer-onboarding-design.md`.
```

- [ ] **Step 5: Commit**

```bash
git add docs/GETTING_STARTED.md README.md server/README.md docs/TASKS.md
git commit -m "docs: add 30-minute getting started guide and yarn setup entry points"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full verification**

```bash
yarn tsc --noEmit
yarn lint
yarn test
```

Expected: all green

- [ ] **Step 2: Manual golden-path checklist (document result in PR/TASKS)**

1. Fresh clone or temp worktree
2. `yarn install && yarn setup --yes`
3. XAMPP + migrations
4. `cd server && yarn dev`
5. `yarn android:dev` on physical device
6. Register → home loads

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Two-tier env files | Task 3 |
| `yarn setup` with `--yes`, `--force`, `--check` | Task 2 |
| Skip existing + exit 0 | Task 2 tests |
| LAN IP from scratch (`os.networkInterfaces`) | Task 1 |
| `--yes` localhost fallback + warning | Task 2 |
| Minimal 2-var mobile env | Task 2, 3 |
| Minimal 8-var server env | Task 2, 3 |
| Default port 4000 + loopback side benefit | Task 4, 5 |
| GETTING_STARTED.md | Task 5 |
| README / server README links | Task 5 |
| Security: random JWT_SECRET, dev flags in optional file | Task 2, 3 |
| No production policy changes | Task 4 only touches default in dev path |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-developer-onboarding.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach?
