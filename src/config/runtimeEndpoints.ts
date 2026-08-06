type MobileRuntimeEndpointOptions = {
  requiredInRelease: boolean
  allowHttpInDev: boolean
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase())
}

export function readMobileRuntimeEndpoint(
  name: string,
  raw: string | undefined,
  options: MobileRuntimeEndpointOptions,
): string {
  const value = raw?.trim()
  if (!value) {
    throw new Error(`MobileConfigInvalid:${name}:missing`)
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`MobileConfigInvalid:${name}:malformed`)
  }

  if (parsed.username || parsed.password) {
    throw new Error(`MobileConfigInvalid:${name}:credentials`)
  }

  if (__DEV__) {
    if (!options.allowHttpInDev && parsed.protocol !== 'https:') {
      throw new Error(`MobileConfigInvalid:${name}:https-required`)
    }
  } else if (options.requiredInRelease) {
    if (parsed.protocol !== 'https:') {
      throw new Error(`MobileConfigInvalid:${name}:https-required`)
    }
    if (isLoopbackHost(parsed.hostname)) {
      throw new Error(`MobileConfigInvalid:${name}:loopback`)
    }
  }

  return parsed.toString().replace(/\/$/, '')
}
