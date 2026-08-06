/** Max issued-at skew between paired dual-format credentials before consistency warning (ms). */
export const DUAL_FORMAT_ISSUE_SKEW_MS =
  Number(process.env.EXPO_PUBLIC_DUAL_FORMAT_ISSUE_SKEW_MS) || 300_000

/** HCE presentation arm window after pre-tap consent (ms). */
export const HCE_ARM_WINDOW_MS =
  Number(process.env.EXPO_PUBLIC_HCE_ARM_WINDOW_MS) || 60_000

/** Hard cap for combined NFC mDOC + companion payload size (bytes). */
export const NFC_PAYLOAD_MAX_BYTES =
  Number(process.env.EXPO_PUBLIC_NFC_PAYLOAD_MAX_BYTES) || 65_536

/** Target combined payload size before arm-time warning (bytes). */
export const NFC_PAYLOAD_TARGET_BYTES = 32_768
