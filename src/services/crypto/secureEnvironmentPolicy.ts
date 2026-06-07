type SecureEnvironmentSupport = {
  isLocalSecureEnvironmentSupported: () => boolean
}

export function assertHardwareSecureEnvironmentSupported(
  secureEnvironment: SecureEnvironmentSupport,
): void {
  if (!secureEnvironment.isLocalSecureEnvironmentSupported()) {
    throw new Error('HardwareSecureEnvironmentRequired: native secure environment is unavailable')
  }
}
