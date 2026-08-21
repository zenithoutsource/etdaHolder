import { areDevelopmentApisEnabled } from './developmentApiPolicy'

test.each([
  ['production', false],
  ['development', true],
  ['test', true],
  [undefined, true],
] as const)('NODE_ENV=%s enables development APIs: %s', (nodeEnv, expected) => {
  expect(areDevelopmentApisEnabled(nodeEnv)).toBe(expected)
})

test('ENABLE_DEVELOPMENT_APIS=true keeps development APIs on in production', () => {
  expect(areDevelopmentApisEnabled('production', 'true')).toBe(true)
  expect(areDevelopmentApisEnabled('production', '1')).toBe(true)
})

test('ENABLE_DEVELOPMENT_APIS=false turns development APIs off outside production', () => {
  expect(areDevelopmentApisEnabled('development', 'false')).toBe(false)
  expect(areDevelopmentApisEnabled('test', '0')).toBe(false)
})
