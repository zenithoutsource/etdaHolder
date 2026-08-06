const packageJson = require('../package.json')

test('routes yarn android through the Gradle short-path wrapper', () => {
  expect(packageJson.scripts.android).toBe('node ./scripts/expo-run-android.js')
})
