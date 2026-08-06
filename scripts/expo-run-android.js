#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const { resolveGradleEnvironment } = require('./gradle-env');

const projectRoot = path.resolve(__dirname, '..');
const expoCli = require.resolve('expo/bin/cli');
const args = process.argv.slice(2);

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
