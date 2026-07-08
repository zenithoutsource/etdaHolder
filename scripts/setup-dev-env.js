#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const { detectLanIp } = require('./detectLanIp');

const projectRoot = process.env.SETUP_PROJECT_ROOT
  ? path.resolve(process.env.SETUP_PROJECT_ROOT)
  : path.resolve(__dirname, '..');
const rootEnvPath = path.join(projectRoot, '.env');
const serverEnvPath = path.join(projectRoot, 'server', '.env');

function parseArgs(argv) {
  return {
    yes: argv.includes('--yes'),
    force: argv.includes('--force'),
    check: argv.includes('--check'),
  };
}

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
    console.log(
      `⏭  Skipped ${path.relative(projectRoot, filePath)} (already exists; use --force to overwrite)`,
    );
    return false;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓  Wrote ${path.relative(projectRoot, filePath)}`);
  return true;
}

function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resolveBaseUrl({ yes }) {
  const testIp = process.env.SETUP_TEST_LAN_IP;
  const detected = testIp ?? detectLanIp();

  if (!yes && process.stdin.isTTY) {
    const defaultUrl = detected ? `http://${detected}:4000` : 'http://localhost:4000';
    const answer = await promptLine(
      `Wallet API base URL [${defaultUrl}]: `,
    );
    if (!answer) return defaultUrl;
    if (answer.startsWith('http://') || answer.startsWith('https://')) return answer;
    return `http://${answer}:4000`;
  }

  if (detected) return `http://${detected}:4000`;

  console.warn(
    '⚠  No LAN IP detected; using http://localhost:4000. For physical devices, set EXPO_PUBLIC_WALLET_API_BASE_URL manually or use adb reverse.',
  );
  return 'http://localhost:4000';
}

async function tcpProbe(host, port, timeoutMs = 1500) {
  const net = require('net');
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('error', () => done(false));
    socket.once('timeout', () => done(false));
    socket.connect(port, host, () => done(true));
  });
}

async function httpProbe(url, timeoutMs = 2000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

async function runCheck() {
  let ok = true;

  if (!fs.existsSync(rootEnvPath)) {
    console.error('✗ Missing .env — run yarn setup');
    ok = false;
  }

  if (!fs.existsSync(serverEnvPath)) {
    console.error('✗ Missing server/.env — run yarn setup');
    ok = false;
  }

  if (!(await tcpProbe('127.0.0.1', 3306))) {
    console.error('✗ MySQL not reachable on 127.0.0.1:3306 (start XAMPP MySQL)');
    ok = false;
  } else {
    console.log('✓  MySQL reachable on 127.0.0.1:3306');
  }

  if (!(await httpProbe('http://127.0.0.1:4000/wallet-api/auth/login'))) {
    console.error('✗ Wallet backend not responding on http://127.0.0.1:4000');
    ok = false;
  } else {
    console.log('✓  Wallet backend reachable on http://127.0.0.1:4000');
  }

  process.exit(ok ? 0 : 1);
}

function printNextSteps() {
  console.log('\nNext steps:');
  console.log('  1. Start XAMPP MySQL');
  console.log('  2. Apply migrations — see docs/GETTING_STARTED.md');
  console.log('  3. cd server && yarn install && yarn dev');
  console.log('  4. yarn android:dev');
  console.log('\nFull guide: docs/GETTING_STARTED.md');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.check) {
    await runCheck();
    return;
  }

  let baseUrl;
  try {
    baseUrl = await resolveBaseUrl(args);
  } catch {
    process.exit(1);
  }

  const jwtSecret = crypto.randomBytes(24).toString('hex');
  const rootContent = buildRootEnv(baseUrl);
  const serverContent = buildServerEnv(jwtSecret);

  try {
    writeIfMissing(rootEnvPath, rootContent, args.force);
    writeIfMissing(serverEnvPath, serverContent, args.force);
  } catch (error) {
    console.error('✗ Failed to write env files:', error instanceof Error ? error.message : error);
    process.exit(args.yes ? 3 : 1);
  }

  printNextSteps();
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildRootEnv,
  buildServerEnv,
  parseArgs,
  resolveBaseUrl,
  writeIfMissing,
};
