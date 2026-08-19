function readBooleanOverride(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  return undefined
}

export function areDevelopmentApisEnabled(
  nodeEnv = process.env.NODE_ENV,
  enableOverride = process.env.ENABLE_DEVELOPMENT_APIS,
): boolean {
  const override = readBooleanOverride(enableOverride)
  if (override !== undefined) return override
  return nodeEnv !== 'production'
}
