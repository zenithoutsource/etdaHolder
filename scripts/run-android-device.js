#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveGradleEnvironment } = require('./gradle-env');

const projectRoot = path.resolve(__dirname, '..');
const defaultPort = '8081';

function resolveAdbCommand() {
  const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (sdkRoot) {
    const adbPath = path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
    if (fs.existsSync(adbPath)) {
      return adbPath;
    }
  }

  return 'adb';
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    ...options,
  });
}

function runInherited(command, args, options = {}) {
  const { env: optionEnv, ...rest } = options;
  const needsShell = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: needsShell,
    ...rest,
    env: resolveGradleEnvironment(optionEnv),
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function parseAdbDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const serial = parts[0];
      const status = parts[1];
      const details = Object.fromEntries(
        parts
          .slice(2)
          .map((part) => part.split(':'))
          .filter(([key, value]) => key && value)
      );
      return {
        serial,
        status,
        name: details.model || `Device ${serial}`,
        details,
      };
    });
}

function readDeviceProp(adb, serial, propName) {
  const result = run(adb, ['-s', serial, 'shell', 'getprop', propName]);
  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout.trim().toLowerCase();
}

function hasEmulatorAdbIdentity(device) {
  const identityValues = [
    device.serial,
    device.details.product,
    device.details.model,
    device.details.device,
  ]
    .filter(Boolean)
    .map((value) => value.toLowerCase());

  return identityValues.some(
    (value) =>
      value.startsWith('emulator-') ||
      value.includes('sdk_gphone') ||
      value.includes('sdk_phone') ||
      value.includes('generic_x86') ||
      value.includes('generic_x64') ||
      value.includes('emu64') ||
      value.includes('genymotion') ||
      value.includes('vbox')
  );
}

function hasEmulatorSystemProps(adb, device) {
  const props = [
    readDeviceProp(adb, device.serial, 'ro.kernel.qemu'),
    readDeviceProp(adb, device.serial, 'ro.boot.qemu'),
    readDeviceProp(adb, device.serial, 'ro.hardware'),
    readDeviceProp(adb, device.serial, 'ro.product.manufacturer'),
    readDeviceProp(adb, device.serial, 'ro.product.brand'),
    readDeviceProp(adb, device.serial, 'ro.product.device'),
    readDeviceProp(adb, device.serial, 'ro.product.name'),
  ].filter(Boolean);

  return props.some(
    (value) =>
      value === '1' ||
      value.includes('goldfish') ||
      value.includes('ranchu') ||
      value.includes('sdk_gphone') ||
      value.includes('sdk_phone') ||
      value.includes('generic') ||
      value.includes('genymotion') ||
      value.includes('vbox')
  );
}

function getPhysicalDevices(adb, devices) {
  return devices.filter((device) => {
    if (device.status !== 'device') {
      return false;
    }

    if (hasEmulatorAdbIdentity(device)) {
      return false;
    }

    return !hasEmulatorSystemProps(adb, device);
  });
}

function readAndroidPackageName() {
  const appConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));
  const packageName = appConfig.expo?.android?.package;
  if (!packageName) {
    console.error('Missing expo.android.package in app.json.');
    process.exit(1);
  }
  return packageName;
}

function resolveGradlewCommand() {
  return path.join(projectRoot, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
}

function resolveDebugApkPath() {
  return path.join(projectRoot, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
}

const adb = resolveAdbCommand();
const adbResult = run(adb, ['devices', '-l']);

if (adbResult.error) {
  console.error('Could not run adb. Install Android platform-tools and make sure adb is on PATH.');
  console.error(adbResult.error.message);
  process.exit(1);
}

if (adbResult.status !== 0) {
  console.error(adbResult.stderr || adbResult.stdout);
  process.exit(adbResult.status ?? 1);
}

const physicalDevices = getPhysicalDevices(adb, parseAdbDevices(adbResult.stdout));

if (physicalDevices.length === 0) {
  console.error('No physical Android device is connected or authorized.');
  console.error('Connect a device with USB debugging enabled, then run yarn android again.');
  process.exit(1);
}

const selectedDevice = physicalDevices[0];
const packageName = readAndroidPackageName();
const gradlew = resolveGradlewCommand();
const apkPath = resolveDebugApkPath();

if (!fs.existsSync(gradlew)) {
  console.error('Missing Android native project. Run npx expo prebuild --platform android first.');
  process.exit(1);
}

console.log(`Using physical Android device: ${selectedDevice.name} (${selectedDevice.serial})`);
runInherited(
  gradlew,
  ['app:assembleDebug', '-x', 'lint', '-x', 'test', '--configure-on-demand', `-PreactNativeDevServerPort=${defaultPort}`],
  { cwd: path.join(projectRoot, 'android') }
);

if (!fs.existsSync(apkPath)) {
  console.error(`Android APK was not found at ${apkPath}.`);
  process.exit(1);
}

runInherited(adb, ['-s', selectedDevice.serial, 'install', '-r', '-d', apkPath]);
runInherited(adb, [
  '-s',
  selectedDevice.serial,
  'shell',
  'monkey',
  '-p',
  packageName,
  '-c',
  'android.intent.category.LAUNCHER',
  '1',
]);

const expoCli = require.resolve('expo/bin/cli');
const isWifiDevice = selectedDevice.serial.includes(':') || selectedDevice.serial.includes('._adb-tls');
const expoArgs = ['start', '--dev-client', '--port', defaultPort];
if (isWifiDevice) expoArgs.push('--host', 'lan');
runInherited(process.execPath, [expoCli, ...expoArgs]);
