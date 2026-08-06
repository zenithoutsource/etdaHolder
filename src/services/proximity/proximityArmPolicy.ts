import { HCE_ARM_WINDOW_MS, NFC_PAYLOAD_MAX_BYTES } from '@/src/config/dualFormatPolicy'

export type ProximityArmValidationInput = {
  mdocPayloadBytes: number
  companionPayloadBytes?: number
}

export function readHceArmWindowMs(): number {
  return HCE_ARM_WINDOW_MS
}

export function validateProximityArmPayload(input: ProximityArmValidationInput): void {
  const combined = input.mdocPayloadBytes + (input.companionPayloadBytes ?? 0)
  if (combined > NFC_PAYLOAD_MAX_BYTES) {
    throw new Error(
      `ProximityPayloadTooLarge: combined NFC payload ${combined} bytes exceeds cap ${NFC_PAYLOAD_MAX_BYTES}`,
    )
  }
}
