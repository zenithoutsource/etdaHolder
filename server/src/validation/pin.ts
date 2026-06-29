const PIN_PATTERN = /^\d{6}$/

const WEAK_PINS = new Set([
  '000000',
  '111111',
  '222222',
  '333333',
  '444444',
  '555555',
  '666666',
  '777777',
  '888888',
  '999999',
  '123456',
  '654321',
  '012345',
  '543210',
])

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin) && !WEAK_PINS.has(pin)
}

export function pinValidationMessage(pin: string): string | undefined {
  if (!PIN_PATTERN.test(pin)) {
    return 'PIN must be exactly 6 digits'
  }
  if (WEAK_PINS.has(pin)) {
    return 'PIN is too easy to guess'
  }
  return undefined
}
