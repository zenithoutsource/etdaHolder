type DeviceIntegrityCheck = {
  isJailBroken: boolean
}

export function assertDeviceIntegrity(check: DeviceIntegrityCheck): void {
  if (check.isJailBroken) {
    throw new Error('DeviceIntegrityCompromised: rooted or jailbroken device detected')
  }
}
