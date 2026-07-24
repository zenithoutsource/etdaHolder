import appConfig from '../../app.json'

type ExpoPluginEntry = string | [string, unknown]

type AppConfigWithAndroidBackup = {
  expo: {
    android?: {
      allowBackup?: boolean
    }
    plugins?: ExpoPluginEntry[]
  }
}

describe('Android backup policy', () => {
  it('disables application backup for device-bound wallet data', () => {
    const config = appConfig as AppConfigWithAndroidBackup

    expect(config.expo.android?.allowBackup).toBe(false)
  })

  it('registers the Android backup-rules config plugin', () => {
    const config = appConfig as AppConfigWithAndroidBackup
    const pluginNames = config.expo.plugins?.map((entry) =>
      typeof entry === 'string' ? entry : entry[0],
    )

    expect(pluginNames).toContain('./plugins/with-android-backup-rules.js')
  })
})
