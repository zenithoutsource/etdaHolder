#!/usr/bin/env node

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

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

function run(command, args) {
  return spawnSync(command, args, { cwd: projectRoot, encoding: 'utf8' });
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
        parts.slice(2).map((part) => part.split(':')).filter(([key, value]) => key && value)
      );
      return { serial, status, details };
    });
}

function isEmulator(device) {
  const identityValues = [device.serial, device.details.product, device.details.model, device.details.device]
    .filter(Boolean)
    .map((v) => v.toLowerCase());
  return identityValues.some(
    (v) =>
      v.startsWith('emulator-') ||
      v.includes('sdk_gphone') ||
      v.includes('sdk_phone') ||
      v.includes('generic_x86') ||
      v.includes('generic_x64') ||
      v.includes('emu64') ||
      v.includes('genymotion') ||
      v.includes('vbox')
  );
}

// Android 11+ Wireless Debugging uses mDNS TLS serials like:
//   adb-<id>-<hash>._adb-tls-connect._tcp
function isTlsWireless(device) {
  return device.serial.includes('._adb-tls');
}

// Traditional TCP/IP adb connect uses IP:port serials
function isTcpWireless(device) {
  return /^\d+\.\d+\.\d+\.\d+:\d+$/.test(device.serial);
}

const adb = resolveAdbCommand();

const devicesResult = run(adb, ['devices', '-l']);
if (devicesResult.error || devicesResult.status !== 0) {
  console.error('adb not found or failed. Install Android platform-tools and ensure adb is on PATH.');
  process.exit(1);
}

const allDevices = parseAdbDevices(devicesResult.stdout);
const physicalDevices = allDevices.filter((d) => d.status === 'device' && !isEmulator(d));

// Already-wireless devices (TLS or TCP) — nothing to do
const alreadyWireless = physicalDevices.filter((d) => isTlsWireless(d) || isTcpWireless(d));
if (alreadyWireless.length > 0) {
  console.log(`Device already connected wirelessly: ${alreadyWireless[0].serial}`);
  console.log('Run:  yarn android:dev');
  process.exit(0);
}

// USB-only devices (no ':' and no TLS suffix)
const usbDevices = physicalDevices.filter((d) => !isTlsWireless(d) && !isTcpWireless(d));
if (usbDevices.length === 0) {
  console.error('No physical Android device found (USB or wireless).');
  console.error('Connect via USB with USB debugging enabled, or enable Wireless Debugging on Android 11+.');
  process.exit(1);
}

const device = usbDevices[0];
console.log(`Found USB device: ${device.serial}`);

// Enable TCP/IP mode on port 5555
const tcpipResult = run(adb, ['-s', device.serial, 'tcpip', '5555']);
if (tcpipResult.status !== 0) {
  console.error('Failed to switch device to TCP/IP mode:', tcpipResult.stderr || tcpipResult.stdout);
  process.exit(1);
}
console.log('TCP/IP mode enabled on port 5555.');

// Get device IP via routing table — works regardless of interface name (wlan0, wlan1, etc.)
const ipResult = run(adb, ['-s', device.serial, 'shell', 'ip', 'route', 'get', '1.0.0.1']);
const srcMatch = ipResult.stdout.match(/src\s+(\d+\.\d+\.\d+\.\d+)/);
if (!srcMatch) {
  console.error('Could not determine device Wi-Fi IP. Ensure the device is connected to Wi-Fi.');
  console.error(ipResult.stdout);
  process.exit(1);
}
const deviceIp = srcMatch[1];
console.log(`Device Wi-Fi IP: ${deviceIp}`);

// Connect wirelessly
const connectResult = run(adb, ['connect', `${deviceIp}:5555`]);
const connectOutput = (connectResult.stdout || '').trim();
console.log(connectOutput);

if (!connectOutput.includes('connected')) {
  console.error('Wi-Fi connection failed. Make sure PC and device are on the same network.');
  process.exit(1);
}

console.log(`\nConnected ${deviceIp}:5555 — USB cable can now be removed.`);
console.log('Run:  yarn android:dev');
