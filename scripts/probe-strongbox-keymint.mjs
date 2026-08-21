#!/usr/bin/env node
/**
 * StrongBox KeyMint host + device probe helper.
 *
 * Usage:
 *   yarn probe:strongbox
 *   yarn probe:strongbox -- --serial adb-R5CX217KVPY-jjqhkj._adb-tls-connect._tcp
 *   yarn probe:strongbox -- --host-only
 *
 * Host-side: FEATURE_STRONGBOX_KEYSTORE via adb.
 * Device-side (--native default when wallet app is installed):
 *   adb broadcast -> StrongBoxKeyMintProbeReceiver -> logcat REPORT_JSON
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const FEATURE = 'android.hardware.strongbox_keystore'
const WALLET_PACKAGE = 'com.thanaboon.chan.etdaWallet'
const RECEIVER_COMPONENT =
  'com.etdawallet.hardwareecdsa.StrongBoxKeyMintProbeReceiver'
const LOG_TAG = 'StrongBoxKeyMintProbe'
const REPORT_JSON_PREFIX = 'REPORT_JSON:'

function parseArgs(argv) {
  const serials = []
  let hostOnly = false
  let nativeOnly = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--host-only') {
      hostOnly = true
    } else if (arg === '--native-only') {
      nativeOnly = true
    } else if (arg === '--serial') {
      const value = argv[index + 1]
      if (!value) {
        throw new Error('--serial requires a device id')
      }
      serials.push(value)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return { serials, hostOnly, nativeOnly }
}

function printHelp() {
  console.log(`Usage:
  yarn probe:strongbox
  yarn probe:strongbox -- --serial <adb-device-id>
  yarn probe:strongbox -- --host-only
  yarn probe:strongbox -- --native-only --serial <adb-device-id>`)
}

function runAdb(args) {
  const result = spawnSync('adb', args, { encoding: 'utf8' })
  if (result.error) {
    throw result.error
  }
  return {
    status: result.status ?? 1,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  }
}

function listDevices() {
  const { status, stdout } = runAdb(['devices'])
  if (status !== 0) {
    return []
  }

  return stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.endsWith('\tdevice'))
    .map((line) => line.split('\t')[0])
}

function hasStrongBoxFeature(serial) {
  const args = serial
    ? ['-s', serial, 'shell', 'pm', 'has-feature', FEATURE]
    : ['shell', 'pm', 'has-feature', FEATURE]
  const { status, stdout } = runAdb(args)
  return status === 0 && stdout === 'true'
}

function isProbeReceiverRegistered(serial) {
  const args = serial
    ? ['-s', serial, 'shell', 'dumpsys', 'package', WALLET_PACKAGE]
    : ['shell', 'dumpsys', 'package', WALLET_PACKAGE]
  const { status, stdout } = runAdb(args)
  return status === 0 && stdout.includes(RECEIVER_COMPONENT)
}

function isWalletInstalled(serial) {
  const args = serial
    ? ['-s', serial, 'shell', 'pm', 'path', WALLET_PACKAGE]
    : ['shell', 'pm', 'path', WALLET_PACKAGE]
  const { status, stdout } = runAdb(args)
  return status === 0 && stdout.startsWith('package:')
}

function readDeviceProps(serial) {
  const read = (prop) => {
    const args = serial
      ? ['-s', serial, 'shell', 'getprop', prop]
      : ['shell', 'getprop', prop]
    const { stdout } = runAdb(args)
    return stdout || 'unknown'
  }

  return {
    manufacturer: read('ro.product.manufacturer'),
    model: read('ro.product.model'),
    sdk: read('ro.build.version.sdk'),
    securityPatch: read('ro.build.version.security_patch'),
  }
}

async function runNativeProbe(serial) {
  runAdb(['-s', serial, 'logcat', '-c'])
  const broadcast = runAdb([
    '-s',
    serial,
    'shell',
    'am',
    'broadcast',
    '-n',
    `${WALLET_PACKAGE}/${RECEIVER_COMPONENT}`,
    '-a',
    'com.etdawallet.hardwareecdsa.PROBE_STRONGBOX',
  ])

  if (!broadcast.stdout.includes('Broadcast completed')) {
    return {
      ok: false,
      error: broadcast.stdout || broadcast.stderr || 'Broadcast failed',
    }
  }

  await delay(2500)

  const logcat = runAdb(['-s', serial, 'logcat', '-d', '-s', `${LOG_TAG}:I`])
  const report = parseNativeReport(logcat.stdout)
  if (!report) {
    return {
      ok: false,
      error: 'No StrongBoxKeyMintProbe REPORT_JSON in logcat. Rebuild dev app after native module changes.',
      logcat: logcat.stdout,
    }
  }

  return { ok: true, report }
}

function parseNativeReport(logcatOutput) {
  const lines = logcatOutput.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    const markerIndex = line.indexOf(REPORT_JSON_PREFIX)
    if (markerIndex === -1) {
      continue
    }
    const jsonText = line.slice(markerIndex + REPORT_JSON_PREFIX.length).trim()
    try {
      return JSON.parse(jsonText)
    } catch {
      return null
    }
  }
  return null
}

function printHeader(title) {
  console.log(`\n=== ${title} ===`)
}

function printHostSummary(serial, props, featureAvailable) {
  console.log(`manufacturer: ${props.manufacturer}`)
  console.log(`model: ${props.model}`)
  console.log(`sdk: ${props.sdk}`)
  console.log(`securityPatch: ${props.securityPatch}`)
  console.log(`FEATURE_STRONGBOX_KEYSTORE (${FEATURE}): ${featureAvailable ? 'true' : 'false'}`)
}

function printNativeSummary(report) {
  if (report.strongBoxUnavailableExceptionClass) {
    console.log(
      `${report.strongBoxUnavailableExceptionClass}: ${report.strongBoxUnavailableExceptionMessage ?? 'no-message'}`,
    )
  } else {
    console.log('StrongBoxUnavailableException: not thrown (StrongBox keygen succeeded or API < 28)')
  }

  if (report.walletSpecStrongBoxUnavailableExceptionClass) {
    console.log(
      `wallet-spec ${report.walletSpecStrongBoxUnavailableExceptionClass}: ${report.walletSpecStrongBoxUnavailableExceptionMessage ?? 'no-message'}`,
    )
  }

  console.log(`keyCreatePath: ${report.keyCreatePath ?? 'unknown'}`)
  console.log(`securityLevel: ${report.securityLevel ?? 'unknown'}`)
  console.log(`walletSpecKeyCreatePath: ${report.walletSpecKeyCreatePath ?? 'unknown'}`)
  console.log(`walletSpecSecurityLevel: ${report.walletSpecSecurityLevel ?? 'unknown'}`)
  console.log(`signVerifyOk: ${report.signVerifyOk === true ? 'true' : 'false'}`)
  console.log(`overallPass: ${report.overallPass === true ? 'PASS' : 'FAIL'}`)
}

async function main() {
  const { serials: requestedSerials, hostOnly, nativeOnly } = parseArgs(process.argv.slice(2))

  if (!nativeOnly) {
    printHeader('StrongBox KeyMint probe (host)')
    let adbVersion = 'unknown'
    try {
      adbVersion = execFileSync('adb', ['version'], { encoding: 'utf8' }).split('\n')[0]?.trim() ?? 'unknown'
    } catch {
      console.error('adb not found in PATH. Install Android platform-tools first.')
      process.exit(1)
    }
    console.log(`adb: ${adbVersion}`)
  }

  const devices = requestedSerials.length > 0 ? requestedSerials : listDevices()
  if (devices.length === 0) {
    console.error('No adb device in "device" state.')
    process.exit(2)
  }

  let anyNativeFailure = false

  for (const serial of devices) {
    printHeader(`Device ${serial}`)
    const props = readDeviceProps(serial)
    const featureAvailable = hasStrongBoxFeature(serial)

    if (!nativeOnly) {
      printHostSummary(serial, props, featureAvailable)
    }

    if (hostOnly) {
      continue
    }

    if (!isWalletInstalled(serial)) {
      console.log(`Wallet app not installed (${WALLET_PACKAGE}).`)
      console.log('Install a dev build first: npx expo prebuild --clean && yarn android')
      anyNativeFailure = true
      continue
    }

    if (!isProbeReceiverRegistered(serial)) {
      console.log('Native probe receiver is not in the installed APK yet.')
      console.log('Rebuild and reinstall dev app, then rerun:')
      console.log('  npx expo prebuild --clean')
      console.log('  yarn android')
      console.log(`  yarn probe:strongbox -- --serial ${serial}`)
      anyNativeFailure = true
      continue
    }

    printHeader(`Native probe ${serial}`)
    const native = await runNativeProbe(serial)
    if (!native.ok) {
      console.log(`native probe failed: ${native.error}`)
      if (native.logcat) {
        console.log(native.logcat)
      }
      anyNativeFailure = true
      continue
    }

    printNativeSummary(native.report)
  }

  if (!hostOnly && anyNativeFailure) {
    process.exit(3)
  }
}

void main()
