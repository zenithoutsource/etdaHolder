import type { CompanionTransportPlugin } from './types'
import { companionV1Plugin } from './plugins/companionV1'

const plugins: CompanionTransportPlugin[] = [companionV1Plugin]

const pluginById = new Map(plugins.map((plugin) => [plugin.id, plugin]))

export function listCompanionTransportPlugins(): CompanionTransportPlugin[] {
  return [...plugins]
}

export function getCompanionTransportPlugin(pluginId: string): CompanionTransportPlugin {
  const plugin = pluginById.get(pluginId)
  if (!plugin) {
    throw new Error(`CompanionTransportPluginNotFound: ${pluginId}`)
  }
  return plugin
}

export function getCompanionTransportPluginForAid(aidHex: string): CompanionTransportPlugin | undefined {
  const normalized = aidHex.replace(/\s+/g, '').toLowerCase()
  return plugins.find((plugin) =>
    plugin.aids.some((aid) => aid.toLowerCase() === normalized),
  )
}

export function registerCompanionTransportPlugin(plugin: CompanionTransportPlugin): void {
  if (pluginById.has(plugin.id)) {
    throw new Error(`CompanionTransportPluginDuplicate: ${plugin.id}`)
  }
  plugins.push(plugin)
  pluginById.set(plugin.id, plugin)
}
