const PIN_PATTERN = /^\d{6}$/

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin)
}

export function pinValidationMessage(pin: string): string | undefined {
  if (!PIN_PATTERN.test(pin)) {
    return 'PIN must be exactly 6 digits'
  }
  return undefined
}
