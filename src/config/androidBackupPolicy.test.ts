import appConfig from '../../app.json'

type AppConfigWithAndroidBackup = {
  expo: {
    android?: {
      allowBackup?: boolean
    }
  }
}

describe('Android backup policy', () => {
  it('disables application backup for device-bound wallet data', () => {
    const config = appConfig as AppConfigWithAndroidBackup

    expect(config.expo.android?.allowBackup).toBe(false)
  })
})
