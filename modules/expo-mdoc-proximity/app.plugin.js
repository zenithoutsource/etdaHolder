const { withAndroidManifest } = require('@expo/config-plugins')

const ANDROID_PERMISSIONS = [
  { name: 'android.permission.NFC' },
  { name: 'android.permission.BLUETOOTH', maxSdkVersion: '30' },
  { name: 'android.permission.BLUETOOTH_ADMIN', maxSdkVersion: '30' },
  { name: 'android.permission.BLUETOOTH_ADVERTISE' },
  { name: 'android.permission.BLUETOOTH_CONNECT' },
  { name: 'android.permission.ACCESS_FINE_LOCATION' },
]

function readUsesPermissions(manifest) {
  const raw = manifest.manifest['uses-permission'] ?? []
  return Array.isArray(raw) ? raw : raw ? [raw] : []
}

function permissionName(entry) {
  return entry?.$?.['android:name']
}

function ensureUsesPermission(manifest, permission) {
  const usesPermissions = readUsesPermissions(manifest)
  const existing = usesPermissions.find((entry) => permissionName(entry) === permission.name)

  if (existing) {
    if (permission.maxSdkVersion) {
      existing.$['android:maxSdkVersion'] = permission.maxSdkVersion
    }
    manifest.manifest['uses-permission'] = usesPermissions
    return
  }

  usesPermissions.push({
    $: {
      'android:name': permission.name,
      ...(permission.maxSdkVersion ? { 'android:maxSdkVersion': permission.maxSdkVersion } : {}),
    },
  })
  manifest.manifest['uses-permission'] = usesPermissions
}

function ensureNfcFeature(manifest) {
  const raw = manifest.manifest['uses-feature'] ?? []
  const features = Array.isArray(raw) ? raw : raw ? [raw] : []
  const exists = features.some((entry) => entry.$?.['android:name'] === 'android.hardware.nfc')
  if (exists) return

  features.push({
    $: {
      'android:name': 'android.hardware.nfc',
      'android:required': 'false',
    },
  })
  manifest.manifest['uses-feature'] = features
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withMdocProximity = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults

    for (const permission of ANDROID_PERMISSIONS) {
      ensureUsesPermission(manifest, permission)
    }

    ensureNfcFeature(manifest)
    return config
  })

module.exports = withMdocProximity
