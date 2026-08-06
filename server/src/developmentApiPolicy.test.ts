import { areDevelopmentApisEnabled } from './developmentApiPolicy'

test.each([
  ['production', false],
  ['development', true],
  ['test', true],
  [undefined, true],
] as const)('NODE_ENV=%s enables development APIs: %s', (nodeEnv, expected) => {
  expect(areDevelopmentApisEnabled(nodeEnv)).toBe(expected)
})
