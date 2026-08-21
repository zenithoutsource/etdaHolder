/** Max issued-at skew between paired dual-format credentials before consistency warning (ms). */
export const DUAL_FORMAT_ISSUE_SKEW_MS =
  Number(process.env.EXPO_PUBLIC_DUAL_FORMAT_ISSUE_SKEW_MS) || 300_000

/** HCE presentation arm window after the engagement QR is ready (ms). */
export const HCE_ARM_WINDOW_MS =
  Number(process.env.EXPO_PUBLIC_HCE_ARM_WINDOW_MS) || 180_000

/**
 * After the DeviceResponse is sent, keep listening this long for the reader to
 * reconnect (its chunked receive may have failed mid-drain) before declaring the
 * presentation complete (ms).
 */
export const HCE_RESPONSE_DRAIN_GRACE_MS =
  Number(process.env.EXPO_PUBLIC_HCE_RESPONSE_DRAIN_GRACE_MS) || 5_000

/** Hard cap for combined NFC mDOC + companion payload size (bytes). */
export const NFC_PAYLOAD_MAX_BYTES =
  Number(process.env.EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES) || 65_536

/** Target combined payload size before arm-time warning (bytes). */
export const NFC_PAYLOAD_TARGET_BYTES = 32_768
