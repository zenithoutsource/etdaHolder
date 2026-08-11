const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  resolveGradleEnvironment,
  cleanStaleSandboxNativeCaches,
  shouldReplaceGradleHome,
  SHORT_GRADLE_HOME_WIN,
  SANDBOX_CACHE_MARKER,
} = require('./gradle-env');

describe('gradle-env Windows short-home guard', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  test('replaces Cursor sandbox GRADLE_USER_HOME on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const sandboxHome = `C:\\Users\\mysti\\AppData\\Local\\Temp\\${SANDBOX_CACHE_MARKER}\\abc123\\gradle`;
    expect(shouldReplaceGradleHome(sandboxHome)).toBe(true);

    const env = resolveGradleEnvironment({ GRADLE_USER_HOME: sandboxHome });
    expect(env.GRADLE_USER_HOME).toBe(SHORT_GRADLE_HOME_WIN);
  });

  test('leaves a short non-sandbox home alone', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const env = resolveGradleEnvironment({ GRADLE_USER_HOME: 'C:\\gradle' });
    expect(env.GRADLE_USER_HOME).toBe('C:\\gradle');
  });

  test('purges .cxx trees whose .ninja_deps still mention the sandbox cache', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gradle-env-'));
    const cxxDir = path.join(root, 'node_modules', 'expo-modules-core', 'android', '.cxx', 'Debug');
    fs.mkdirSync(cxxDir, { recursive: true });
    fs.writeFileSync(
      path.join(cxxDir, '.ninja_deps'),
      `C:/Users/x/AppData/Local/Temp/${SANDBOX_CACHE_MARKER}/hash/gradle/caches/expr_iif.hpp`,
    );

    const removed = cleanStaleSandboxNativeCaches(root);
    expect(removed).toContain(
      path.join(root, 'node_modules', 'expo-modules-core', 'android', '.cxx'),
    );
    expect(fs.existsSync(path.join(root, 'node_modules', 'expo-modules-core', 'android', '.cxx'))).toBe(
      false,
    );

    fs.rmSync(root, { recursive: true, force: true });
  });
});
