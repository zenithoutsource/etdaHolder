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
