# Android Backup Transfer Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude every Android app-private data domain from cloud backup and device-to-device transfer through reproducible Expo configuration, while preserving the completed incident recovery and new wallet state.

**Architecture:** Keep `expo.android.allowBackup = false` as the cloud-backup control and add a neutral local Expo config plugin that generates legacy full-backup exclusions plus Android 12+ cloud/device-transfer exclusions. The plugin owns manifest references and deterministic XML resources during prebuild; runtime storage and signing code remain unchanged.

**Tech Stack:** Expo SDK 54 Continuous Native Generation, `@expo/config-plugins`, CommonJS Node scripts, Jest 29, Android XML resources, Gradle/ADB.

## Global Constraints

- Keep `expo.android.allowBackup = false`.
- Exclude `root`, `file`, `database`, `sharedpref`, `external`, `device_root`, `device_file`, `device_database`, and `device_sharedpref` from every supported backup mode.
- Android 11 and earlier use `android:fullBackupContent="@xml/wallet_backup_rules"`.
- Android 12 and later use `android:dataExtractionRules="@xml/wallet_data_extraction_rules"` with explicit `<cloud-backup>` and `<device-transfer>` sections.
- Add no dependency and no runtime mobile API, storage, signing, or startup-wipe behavior.
- Keep new identifiers, files, comments, and documentation neutral.
- Preserve unrelated changes in the dirty `dev` checkout and work only on `fix/android-backup-restore` plus the detached build checkout.
- Do not clear application data again. The completed incident reset already created the new Holder DID and empty wallet.
- Install only on the explicitly authorized SM-S928B transport and resolve the application package from `app.json` at runtime.
- SM-S928B verification is incident evidence; it does not satisfy the Galaxy A26 plus ACR1311U-N2 production validation gate.
- Record failing project-wide TypeScript/lint gates exactly; do not describe them as passing.

---

### Task 1: Generate complete Android backup exclusion rules

**Files:**

- Create: `plugins/with-android-backup-rules.js`
- Create: `scripts/androidBackupRules.test.js`
- Modify: `src/config/androidBackupPolicy.test.ts`
- Modify: `app.json`

**Interfaces:**

- Consumes: Expo `withAndroidManifest`, `withDangerousMod`, and `AndroidConfig.Manifest.getMainApplicationOrThrow` from `@expo/config-plugins`.
- Produces: default config plugin `withAndroidBackupRules(config)`, `ANDROID_BACKUP_DOMAINS`, `applyBackupManifestPolicy(androidManifest)`, `renderLegacyBackupRules()`, `renderDataExtractionRules()`, and `writeBackupRuleResourcesAsync(platformProjectRoot)`.
- Produces generated resources: `android/app/src/main/res/xml/wallet_backup_rules.xml` and `android/app/src/main/res/xml/wallet_data_extraction_rules.xml`.

- [ ] **Step 1: Extend the configuration test before registering the plugin**

Replace `src/config/androidBackupPolicy.test.ts` with:

```ts
import appConfig from '../../app.json';

type ExpoPluginEntry = string | [string, unknown];

type AppConfigWithAndroidBackup = {
  expo: {
    android?: {
      allowBackup?: boolean;
    };
    plugins?: ExpoPluginEntry[];
  };
};

describe('Android backup policy', () => {
  it('disables application backup for device-bound wallet data', () => {
    const config = appConfig as AppConfigWithAndroidBackup;

    expect(config.expo.android?.allowBackup).toBe(false);
  });

  it('registers the Android backup-rules config plugin', () => {
    const config = appConfig as AppConfigWithAndroidBackup;
    const pluginNames = config.expo.plugins?.map((entry) =>
      typeof entry === 'string' ? entry : entry[0],
    );

    expect(pluginNames).toContain('./plugins/with-android-backup-rules.js');
  });
});
```

- [ ] **Step 2: Add failing policy and generation tests before creating the plugin**

Create `scripts/androidBackupRules.test.js`:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, describe, expect, it } = require('@jest/globals');

const pluginPath = path.join(__dirname, '..', 'plugins', 'with-android-backup-rules.js');
const expectedDomains = [
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
];

let tempRoot;

function loadPlugin() {
  expect(fs.existsSync(pluginPath)).toBe(true);
  return require(pluginPath);
}

function countOccurrences(value, fragment) {
  return value.split(fragment).length - 1;
}

afterEach(() => {
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  }
});

describe('Android backup-rules plugin', () => {
  it('defines every supported private-data domain', () => {
    const { ANDROID_BACKUP_DOMAINS } = loadPlugin();

    expect(ANDROID_BACKUP_DOMAINS).toEqual(expectedDomains);
  });

  it('sets both manifest rule references idempotently', () => {
    const { applyBackupManifestPolicy } = loadPlugin();
    const manifest = {
      manifest: {
        application: [{ $: { 'android:name': '.MainApplication' } }],
      },
    };

    applyBackupManifestPolicy(manifest);
    const afterFirstApplication = JSON.stringify(manifest.manifest.application[0]);
    applyBackupManifestPolicy(manifest);

    expect(manifest.manifest.application[0].$).toMatchObject({
      'android:fullBackupContent': '@xml/wallet_backup_rules',
      'android:dataExtractionRules': '@xml/wallet_data_extraction_rules',
    });
    expect(JSON.stringify(manifest.manifest.application[0])).toBe(afterFirstApplication);
  });

  it('fails descriptively when the application element is missing', () => {
    const { applyBackupManifestPolicy } = loadPlugin();

    expect(() => applyBackupManifestPolicy({ manifest: {} })).toThrow(
      'AndroidManifest.xml is missing the required MainApplication element',
    );
  });

  it('renders complete legacy exclusions deterministically', () => {
    const { renderLegacyBackupRules } = loadPlugin();
    const first = renderLegacyBackupRules();

    expect(first).toBe(renderLegacyBackupRules());
    expect(first).toContain('<full-backup-content>');
    for (const domain of expectedDomains) {
      expect(countOccurrences(first, `<exclude domain="${domain}" path="." />`)).toBe(1);
    }
  });

  it('renders complete cloud and device-transfer exclusions deterministically', () => {
    const { renderDataExtractionRules } = loadPlugin();
    const first = renderDataExtractionRules();
    const cloudRules = first.match(/<cloud-backup>([\s\S]*?)<\/cloud-backup>/)?.[1] ?? '';
    const transferRules = first.match(/<device-transfer>([\s\S]*?)<\/device-transfer>/)?.[1] ?? '';

    expect(first).toBe(renderDataExtractionRules());
    expect(first).toContain('<data-extraction-rules>');
    for (const domain of expectedDomains) {
      const exclusion = `<exclude domain="${domain}" path="." />`;
      expect(countOccurrences(cloudRules, exclusion)).toBe(1);
      expect(countOccurrences(transferRules, exclusion)).toBe(1);
    }
  });

  it('writes both resources idempotently', async () => {
    const {
      renderDataExtractionRules,
      renderLegacyBackupRules,
      writeBackupRuleResourcesAsync,
    } = loadPlugin();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-backup-rules-'));

    await writeBackupRuleResourcesAsync(tempRoot);
    await writeBackupRuleResourcesAsync(tempRoot);

    const xmlRoot = path.join(tempRoot, 'app', 'src', 'main', 'res', 'xml');
    expect(fs.readFileSync(path.join(xmlRoot, 'wallet_backup_rules.xml'), 'utf8')).toBe(
      renderLegacyBackupRules(),
    );
    expect(
      fs.readFileSync(path.join(xmlRoot, 'wallet_data_extraction_rules.xml'), 'utf8'),
    ).toBe(renderDataExtractionRules());
  });

  it('wraps resource-write failures with policy context', async () => {
    const { writeBackupRuleResourcesAsync } = loadPlugin();
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wallet-backup-rules-'));
    const invalidRoot = path.join(tempRoot, 'not-a-directory');
    fs.writeFileSync(invalidRoot, 'occupied');

    await expect(writeBackupRuleResourcesAsync(invalidRoot)).rejects.toThrow(
      /^Android backup rule generation failed:/,
    );
  });
});
```

- [ ] **Step 3: Run the focused tests and confirm RED**

Run:

```powershell
$configTest = (Resolve-Path -LiteralPath 'src/config/androidBackupPolicy.test.ts').Path
$pluginTest = (Resolve-Path -LiteralPath 'scripts/androidBackupRules.test.js').Path
.\node_modules\.bin\jest.cmd --roots src scripts --testMatch "**/*.test.[jt]s" --runTestsByPath $configTest $pluginTest --runInBand
```

Expected: FAIL. The configuration test reports the missing plugin registration, and each plugin-policy test reports that `plugins/with-android-backup-rules.js` does not exist. There must be no TypeScript or Jest configuration error.

- [ ] **Step 4: Implement the config plugin**

Create `plugins/with-android-backup-rules.js`:

```js
const fs = require('node:fs/promises')
const path = require('node:path')
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins')

const ANDROID_BACKUP_DOMAINS = Object.freeze([
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
])

const XML_HEADER = '<?xml version="1.0" encoding="utf-8"?>'
const LEGACY_RESOURCE_NAME = 'wallet_backup_rules'
const EXTRACTION_RESOURCE_NAME = 'wallet_data_extraction_rules'

function renderExclusions(indent) {
  return ANDROID_BACKUP_DOMAINS.map(
    (domain) => `${indent}<exclude domain="${domain}" path="." />`,
  ).join('\n')
}

function renderLegacyBackupRules() {
  return `${XML_HEADER}\n<full-backup-content>\n${renderExclusions('  ')}\n</full-backup-content>\n`
}

function renderDataExtractionRules() {
  const exclusions = renderExclusions('    ')
  return `${XML_HEADER}\n<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`
}

function applyBackupManifestPolicy(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest)
  application.$['android:fullBackupContent'] = `@xml/${LEGACY_RESOURCE_NAME}`
  application.$['android:dataExtractionRules'] = `@xml/${EXTRACTION_RESOURCE_NAME}`
  return androidManifest
}

async function writeBackupRuleResourcesAsync(platformProjectRoot) {
  const xmlRoot = path.join(platformProjectRoot, 'app', 'src', 'main', 'res', 'xml')

  try {
    await fs.mkdir(xmlRoot, { recursive: true })
    await Promise.all([
      fs.writeFile(
        path.join(xmlRoot, `${LEGACY_RESOURCE_NAME}.xml`),
        renderLegacyBackupRules(),
        'utf8',
      ),
      fs.writeFile(
        path.join(xmlRoot, `${EXTRACTION_RESOURCE_NAME}.xml`),
        renderDataExtractionRules(),
        'utf8',
      ),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Android backup rule generation failed: ${message}`)
  }
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withAndroidBackupRules = (config) => {
  config = withAndroidManifest(config, (config) => {
    config.modResults = applyBackupManifestPolicy(config.modResults)
    return config
  })

  return withDangerousMod(config, [
    'android',
    async (config) => {
      await writeBackupRuleResourcesAsync(config.modRequest.platformProjectRoot)
      return config
    },
  ])
}

module.exports = withAndroidBackupRules
module.exports.ANDROID_BACKUP_DOMAINS = ANDROID_BACKUP_DOMAINS
module.exports.applyBackupManifestPolicy = applyBackupManifestPolicy
module.exports.renderLegacyBackupRules = renderLegacyBackupRules
module.exports.renderDataExtractionRules = renderDataExtractionRules
module.exports.writeBackupRuleResourcesAsync = writeBackupRuleResourcesAsync
```

- [ ] **Step 5: Register the plugin without changing the existing backup flag**

In the existing `expo.plugins` array in `app.json`, add the plugin immediately after `./plugins/with-android-long-paths.js`:

```json
"./plugins/with-android-backup-rules.js"
```

Keep this existing Android setting unchanged:

```json
"allowBackup": false
```

- [ ] **Step 6: Run the focused tests and confirm GREEN**

Run:

```powershell
$configTest = (Resolve-Path -LiteralPath 'src/config/androidBackupPolicy.test.ts').Path
$pluginTest = (Resolve-Path -LiteralPath 'scripts/androidBackupRules.test.js').Path
.\node_modules\.bin\jest.cmd --roots src scripts --testMatch "**/*.test.[jt]s" --runTestsByPath $configTest $pluginTest --runInBand
```

Expected: PASS, 2 suites and 9 tests with zero failures.

- [ ] **Step 7: Verify clean prebuild output**

Temporarily make the ignored Firebase configuration available without printing it:

```powershell
$primaryWorktree = ((git worktree list --porcelain | Select-String '^worktree ' | Select-Object -First 1).Line -replace '^worktree ', '')
$firebaseSource = Join-Path $primaryWorktree 'google-services.json'
$firebaseCopy = Join-Path (Get-Location) 'google-services.json'
Copy-Item -LiteralPath $firebaseSource -Destination $firebaseCopy
```

Run:

```powershell
try {
  .\node_modules\.bin\expo.cmd prebuild --clean --platform android
} finally {
  Remove-Item -LiteralPath $firebaseCopy -Force
}
```

Expected: prebuild exits 0 and the transient root copy is absent afterward.

Verify generated output:

```powershell
$manifestPath = 'android/app/src/main/AndroidManifest.xml'
$legacyRulesPath = 'android/app/src/main/res/xml/wallet_backup_rules.xml'
$extractionRulesPath = 'android/app/src/main/res/xml/wallet_data_extraction_rules.xml'
Select-String -LiteralPath $manifestPath -Pattern 'android:allowBackup="false"'
Select-String -LiteralPath $manifestPath -Pattern 'android:fullBackupContent="@xml/wallet_backup_rules"'
Select-String -LiteralPath $manifestPath -Pattern 'android:dataExtractionRules="@xml/wallet_data_extraction_rules"'
Get-Content -Raw -LiteralPath $legacyRulesPath
Get-Content -Raw -LiteralPath $extractionRulesPath
```

Expected: all three manifest checks match once. The legacy resource contains each domain once; the extraction resource contains each domain twice, once under cloud backup and once under device transfer.

- [ ] **Step 8: Run focused runtime and project verification**

Run focused tests with worktree-safe discovery:

```powershell
$tests = @(
  (Resolve-Path -LiteralPath 'src/config/androidBackupPolicy.test.ts').Path,
  (Resolve-Path -LiteralPath 'scripts/androidBackupRules.test.js').Path,
  (Resolve-Path -LiteralPath 'src/services/storage/storage.test.ts').Path,
  (Resolve-Path -LiteralPath 'src/services/startup/startupState.test.ts').Path
)
.\node_modules\.bin\jest.cmd --roots src scripts --testMatch "**/*.test.[jt]s" --runTestsByPath $tests --runInBand
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\eslint.cmd .
```

Expected: all four focused suites pass. TypeScript and ESLint pass or reproduce only the previously recorded out-of-scope failures; capture exact output for `docs/TASKS.md`.

- [ ] **Step 9: Commit the tested policy implementation**

Review scope:

```powershell
git diff --check -- app.json plugins/with-android-backup-rules.js scripts/androidBackupRules.test.js src/config/androidBackupPolicy.test.ts
git status --short
```

Commit only Task 1 files:

```powershell
git add -- app.json plugins/with-android-backup-rules.js scripts/androidBackupRules.test.js src/config/androidBackupPolicy.test.ts
git commit -m "fix(android): exclude wallet transfer data" -m "API 31+ devices may ignore allowBackup=false during migration." -m "Generate explicit cloud and device-transfer exclusion rules."
```

---

### Task 2: Verify packaged rules and update durable security records

**Files:**

- Modify: `docs/SECURITY.md`
- Modify: `docs/TASKS.md`
- Consume build-only checkout: `C:\project\wb`

**Interfaces:**

- Consumes: Task 1's `withAndroidBackupRules` plugin and generated XML resource names.
- Produces: packaged-APK evidence, updated installed application, durable security policy, and session record.

- [ ] **Step 1: Move the clean detached build checkout to Task 1 HEAD**

Run from the feature worktree:

```powershell
$featureHead = git rev-parse HEAD
$buildWorktree = 'C:\project\wb'
if (-not (Test-Path -LiteralPath $buildWorktree)) { throw 'Short build worktree is missing' }
if (git -C $buildWorktree status --porcelain) { throw 'Short build worktree is not clean' }
git -C $buildWorktree checkout --detach $featureHead
```

Expected: detached checkout moves to Task 1's commit and remains clean.

- [ ] **Step 2: Regenerate the short checkout without deleting warmed native outputs**

Run:

```powershell
$primaryWorktree = ((git worktree list --porcelain | Select-String '^worktree ' | Select-Object -First 1).Line -replace '^worktree ', '')
$firebaseSource = Join-Path $primaryWorktree 'google-services.json'
$firebaseCopy = Join-Path $buildWorktree 'google-services.json'
Copy-Item -LiteralPath $firebaseSource -Destination $firebaseCopy
try {
  & "$buildWorktree\node_modules\.bin\expo.cmd" prebuild --platform android
} finally {
  Remove-Item -LiteralPath $firebaseCopy -Force
}
```

Expected: prebuild exits 0, generated manifest/resources contain Task 1 policy, and warmed native outputs remain available.

- [ ] **Step 3: Build and install only on the authorized transport**

Run:

```powershell
$targetSerial = 'adb-R5CX217KVPY-jjqhkj._adb-tls-connect._tcp'
$env:ANDROID_SERIAL = $targetSerial
adb -s $targetSerial get-state
adb -s $targetSerial shell getprop ro.product.model
.\gradlew.bat installDebug --console=plain
```

Run the Gradle command from `C:\project\wb\android` with a 20-minute ceiling and condition-based progress polling.

Expected: target state `device`, model `SM-S928B`, `BUILD SUCCESSFUL`, and installation on exactly one device. Do not run `pm clear`.

- [ ] **Step 4: Inspect the packaged APK policy**

Run from `C:\project\wb`:

```powershell
$apkPath = 'android/app/build/outputs/apk/debug/app-debug.apk'
$aapt2 = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools') -Recurse -Filter 'aapt2.exe' |
  Sort-Object { [version]$_.Directory.Name } -Descending |
  Select-Object -First 1 -ExpandProperty FullName
& $aapt2 dump xmltree $apkPath --file AndroidManifest.xml
& $aapt2 dump xmltree $apkPath --file res/xml/wallet_backup_rules.xml
& $aapt2 dump xmltree $apkPath --file res/xml/wallet_data_extraction_rules.xml
```

Expected: packaged manifest reports `allowBackup=false`, `fullBackupContent=@xml/wallet_backup_rules`, and `dataExtractionRules=@xml/wallet_data_extraction_rules`. Packaged resources contain every exclusion domain in the required legacy/cloud/device-transfer sections.

- [ ] **Step 5: Verify installed backup state and wallet readiness without clearing data**

Run:

```powershell
$walletAppId = (Get-Content -Raw -LiteralPath "$buildWorktree\app.json" | ConvertFrom-Json).expo.android.package
$backupMatches = @(adb -s $targetSerial shell dumpsys package $walletAppId | Select-String 'ALLOW_BACKUP')
if ($backupMatches.Count -ne 0) { throw "Installed package still exposes ALLOW_BACKUP" }
```

Ensure Metro remains reachable, clear pinned logcat, relaunch through the established development-client deep link, and capture:

```powershell
adb -s $targetSerial logcat -d -v threadtime ReactNativeJS:I RNKeychainManager:E '*:S' |
  Select-String -Pattern 'wallet-key-ready|prepare-wallet-ready|E_CRYPTO_FAILED|CryptoFailedException|AEADBadTagException'
```

Expected: wallet reaches `wallet-key-ready` and `prepare-wallet-ready`; forbidden crypto errors have zero matches. Authenticate exactly once only if the Keychain prompt appears. Do not add an app-level prompt and do not clear data.

- [ ] **Step 6: Correct the durable security documentation**

Replace the Android backup bullets in `docs/SECURITY.md` with:

```markdown
- Android cloud backup and restore is disabled through `expo.android.allowBackup = false`.
- A tracked local Expo config plugin generates `android:fullBackupContent` exclusions for Android 11 and earlier plus `android:dataExtractionRules` exclusions for both cloud backup and device transfer on Android 12 and later. Every supported app-private data domain is excluded; a missing rule file or manifest application element fails prebuild.
- Wallet Keychain entries, encrypted MMKV files, and device-bound Android Keystore keys must not cross an installation boundary independently. A reinstall or device migration starts a new wallet and requires credential reissuance.
- The existing PIN fallback is only a same-install recovery mechanism; it does not make the Ed25519 signing seed portable or authorize restoring wallet storage across installations.
```

- [ ] **Step 7: Record the completed hardening slice**

Add this session shape at the top of `docs/TASKS.md`, using the observed command outcomes and without claiming target-hardware migration validation:

```markdown
### Session 2026-07-21 (Android cloud and device-transfer exclusions)

- Final branch review identified that `allowBackup=false` alone is not a complete Android 12+ device-transfer control on all manufacturers.
- Added a tracked Expo config plugin that keeps cloud backup disabled and generates complete legacy, cloud-backup, and device-transfer exclusions for every supported app-private data domain.
- Focused config/plugin/storage/startup suites passed with zero failures; clean prebuild produced both manifest references and both XML resources. Project-wide TypeScript/lint results remain recorded as observed and are not described as passing when unrelated failures persist.
- Packaged APK inspection confirmed the manifest attributes and exclusion resources survived packaging; the revised debug APK installed only on the authorized SM-S928B transport and retained zero `ALLOW_BACKUP` matches.
- Post-update startup reached wallet-ready without the original crypto failure. Application data was not cleared again, and credentials still require reissuance under the Holder DID created by the completed incident reset.
- SM-S928B evidence does not close the Galaxy A26 plus ACR1311U-N2 production validation gate. Device-to-device migration behavior remains unclaimed until the negative transfer case is physically exercised on target hardware.
```

- [ ] **Step 8: Re-run focused verification after documentation edits**

Run from the feature worktree:

```powershell
$tests = @(
  (Resolve-Path -LiteralPath 'src/config/androidBackupPolicy.test.ts').Path,
  (Resolve-Path -LiteralPath 'scripts/androidBackupRules.test.js').Path,
  (Resolve-Path -LiteralPath 'src/services/storage/storage.test.ts').Path,
  (Resolve-Path -LiteralPath 'src/services/startup/startupState.test.ts').Path
)
.\node_modules\.bin\jest.cmd --roots src scripts --testMatch "**/*.test.[jt]s" --runTestsByPath $tests --runInBand
git diff --check -- docs/SECURITY.md docs/TASKS.md
```

Expected: all four focused suites pass and documentation has no whitespace errors.

- [ ] **Step 9: Commit only durable documentation**

Run:

```powershell
git status --short
git diff -- docs/SECURITY.md docs/TASKS.md
git add -- docs/SECURITY.md docs/TASKS.md
git commit -m "docs(security): record transfer exclusions" -m "Document explicit Android cloud and device-transfer controls." -m "Retain the target-hardware migration validation boundary."
```

Expected: the commit contains only `docs/SECURITY.md` and `docs/TASKS.md`.

## Self-Review Gate

- [ ] Confirm every revised design requirement maps to Task 1 or Task 2: all domains, both Android rule formats, both modern transfer modes, manifest references, deterministic generation, descriptive failure, no runtime wipe, packaged verification, no second clear, durable docs, and target-hardware limitation.
- [ ] Confirm helper names, XML resource names, and manifest references are identical across tasks.
- [ ] Confirm every code-edit step includes complete code and every verification step has an exact command and expected result.
- [ ] Scan for incomplete language while excluding the scan command itself:

```powershell
rg -n 'T[B]D|T[O]DO|implement later|fill in details|similar to Task' docs/superpowers/plans/2026-07-21-android-backup-transfer-hardening.md |
  Where-Object { $_ -notmatch '^\d+:rg -n' }
```

- [ ] Confirm the feature worktree and detached build worktree preserve unrelated user changes and that no secret content appears in logs, reports, or commits.
