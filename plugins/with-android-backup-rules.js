const fs = require('node:fs/promises')
const path = require('node:path')
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
} = require('@expo/config-plugins')

const ANDROID_BACKUP_DOMAINS = Object.freeze([
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
])

const XML_HEADER = '<?xml version="1.0" encoding="utf-8"?>'
const LEGACY_RESOURCE_NAME = 'wallet_backup_rules'
const EXTRACTION_RESOURCE_NAME = 'wallet_data_extraction_rules'

function renderExclusions(indent) {
  return ANDROID_BACKUP_DOMAINS.map(
    (domain) => `${indent}<exclude domain="${domain}" path="." />`,
  ).join('\n')
}

function renderLegacyBackupRules() {
  return `${XML_HEADER}\n<full-backup-content>\n${renderExclusions('  ')}\n</full-backup-content>\n`
}

function renderDataExtractionRules() {
  const exclusions = renderExclusions('    ')
  return `${XML_HEADER}\n<data-extraction-rules>\n  <cloud-backup>\n${exclusions}\n  </cloud-backup>\n  <device-transfer>\n${exclusions}\n  </device-transfer>\n</data-extraction-rules>\n`
}

function applyBackupManifestPolicy(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest)
  application.$['android:fullBackupContent'] = `@xml/${LEGACY_RESOURCE_NAME}`
  application.$['android:dataExtractionRules'] = `@xml/${EXTRACTION_RESOURCE_NAME}`
  return androidManifest
}

async function writeBackupRuleResourcesAsync(platformProjectRoot) {
  const xmlRoot = path.join(platformProjectRoot, 'app', 'src', 'main', 'res', 'xml')

  try {
    await fs.mkdir(xmlRoot, { recursive: true })
    await Promise.all([
      fs.writeFile(
        path.join(xmlRoot, `${LEGACY_RESOURCE_NAME}.xml`),
        renderLegacyBackupRules(),
        'utf8',
      ),
      fs.writeFile(
        path.join(xmlRoot, `${EXTRACTION_RESOURCE_NAME}.xml`),
        renderDataExtractionRules(),
        'utf8',
      ),
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Android backup rule generation failed: ${message}`)
  }
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withAndroidBackupRules = (config) => {
  config = withAndroidManifest(config, (config) => {
    config.modResults = applyBackupManifestPolicy(config.modResults)
    return config
  })

  return withDangerousMod(config, [
    'android',
    async (config) => {
      await writeBackupRuleResourcesAsync(config.modRequest.platformProjectRoot)
      return config
    },
  ])
}

module.exports = withAndroidBackupRules
module.exports.ANDROID_BACKUP_DOMAINS = ANDROID_BACKUP_DOMAINS
module.exports.applyBackupManifestPolicy = applyBackupManifestPolicy
module.exports.renderLegacyBackupRules = renderLegacyBackupRules
module.exports.renderDataExtractionRules = renderDataExtractionRules
module.exports.writeBackupRuleResourcesAsync = writeBackupRuleResourcesAsync
