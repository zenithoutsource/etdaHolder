const { withAndroidManifest } = require('@expo/config-plugins')

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withDcApiProvider = (config) =>
  withAndroidManifest(config, (config) => {
    const manifest = config.modResults
    const application = manifest.manifest.application?.[0]
    if (!application) return config

    const activities = application.activity ?? []
    const activityList = Array.isArray(activities) ? activities : activities ? [activities] : []
    const activityExists = activityList.some(
      (entry) => entry.$?.['android:name'] === 'com.wallet.dcapiprovider.GetCredentialActivity',
    )
    if (!activityExists) {
      activityList.push({
        $: {
          'android:name': 'com.wallet.dcapiprovider.GetCredentialActivity',
          'android:exported': 'true',
          'android:excludeFromRecents': 'true',
          'android:launchMode': 'singleTop',
          'android:theme': '@android:style/Theme.Translucent.NoTitleBar',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'androidx.identitycredentials.action.GET_CREDENTIALS' } },
              { $: { 'android:name': 'androidx.credentials.registry.provider.action.GET_CREDENTIAL' } },
            ],
            category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          },
        ],
      })
      application.activity = activityList
    }

    return config
  })

module.exports = withDcApiProvider
