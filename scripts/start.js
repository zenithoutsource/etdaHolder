#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

process.env.ANDROID_AVD_HOME = path.join(__dirname, '..', '.empty-avds');

const proc = spawn('expo', ['start', '--dev-client', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
proc.on('exit', (code) => process.exit(code ?? 0));
