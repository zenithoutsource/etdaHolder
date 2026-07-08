import { getCompanionTransportPlugin } from './registry'
import { ETDA_COMPANION_PLUGIN_ID } from './plugins/etdaCompanionV1/constants'

test('registers the ETDA reference companion plugin', () => {
  const plugin = getCompanionTransportPlugin(ETDA_COMPANION_PLUGIN_ID)
  expect(plugin.vendorId).toBe('etda')
  expect(plugin.aids).toContain('A0000004544410100')
  expect(plugin.nonceBytes).toBe(32)
})

test('rejects unknown companion plugins', () => {
  expect(() => getCompanionTransportPlugin('unknown-vendor-v1')).toThrow('CompanionTransportPluginNotFound')
})
