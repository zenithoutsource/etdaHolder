#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const {
  resolveGradleEnvironment,
  cleanStaleSandboxNativeCaches,
  shouldReplaceGradleHome,
} = require('./gradle-env');

const projectRoot = path.resolve(__dirname, '..');
const expoCli = require.resolve('expo/bin/cli');
const args = process.argv.slice(2);

const incomingHome = process.env.GRADLE_USER_HOME;
if (shouldReplaceGradleHome(incomingHome) && process.platform === 'win32') {
  const removed = cleanStaleSandboxNativeCaches(projectRoot);
  if (removed.length > 0) {
    console.log(
      `[gradle-env] Removed ${removed.length} stale native cache path(s) that still referenced Cursor sandbox Gradle home.`,
    );
  }
}

const result = spawnSync(process.execPath, [expoCli, 'run:android', ...args], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: resolveGradleEnvironment(),
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
