const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const scriptPath = path.join(__dirname, 'setup-dev-env.js');

function runSetup(args, projectRoot) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      SETUP_TEST_LAN_IP: '192.168.50.10',
      SETUP_PROJECT_ROOT: projectRoot,
    },
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
    expect(rootEnv).not.toContain('EXPO_PUBLIC_SKIP_PUSH_REGISTRATION=true');
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
    expect(`${result.stdout}${result.stderr}`).toMatch(/skip/i);
  });
});
