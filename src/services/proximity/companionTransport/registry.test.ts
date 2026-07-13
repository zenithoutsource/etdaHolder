import { getCompanionTransportPlugin } from './registry'
import { COMPANION_PLUGIN_ID } from './plugins/companionV1/constants'

test('registers the reference companion plugin', () => {
  const plugin = getCompanionTransportPlugin(COMPANION_PLUGIN_ID)
  expect(plugin.vendorId).toBe('reference')
  expect(plugin.aids).toContain('A00000045444410100')
  expect(plugin.nonceBytes).toBe(32)
})

test('rejects unknown companion plugins', () => {
  expect(() => getCompanionTransportPlugin('unknown-vendor-v1')).toThrow('CompanionTransportPluginNotFound')
})
