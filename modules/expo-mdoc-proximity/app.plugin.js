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
    ensureHostApduService(manifest)
    return config
  })

function ensureHostApduService(manifest) {
  const application = manifest.manifest.application?.[0]
  if (!application) return

  const services = application.service ?? []
  const serviceList = Array.isArray(services) ? services : services ? [services] : []
  const exists = serviceList.some(
    (entry) => entry.$?.['android:name'] === 'com.etdawallet.mdocproximity.CompanionHostApduService',
  )
  if (exists) return

  serviceList.push({
    $: {
      'android:name': 'com.etdawallet.mdocproximity.CompanionHostApduService',
      'android:exported': 'true',
      'android:permission': 'android.permission.BIND_NFC_SERVICE',
    },
    'intent-filter': [
      {
        $: {
          'android:priority': '100',
        },
        action: [{ $: { 'android:name': 'android.nfc.cardemulation.action.HOST_APDU_SERVICE' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      },
    ],
    'meta-data': [
      {
        $: {
          'android:name': 'android.nfc.cardemulation.host_apdu_service',
          'android:resource': '@xml/companion_apdu_service',
        },
      },
    ],
  })

  application.service = serviceList
}

module.exports = withMdocProximity
