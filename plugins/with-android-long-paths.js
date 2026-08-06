const { withGradleProperties } = require('@expo/config-plugins')

function upsertGradleProperty(properties, key, value) {
  const existing = properties.find((entry) => entry.type === 'property' && entry.key === key)
  if (existing) {
    existing.value = value
    return properties
  }

  properties.push({ type: 'property', key, value })
  return properties
}

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withAndroidLongPaths = (config) =>
  withGradleProperties(config, (config) => {
    config.modResults = upsertGradleProperty(config.modResults, 'android.enableLongPaths', 'true')
    return config
  })

module.exports = withAndroidLongPaths
