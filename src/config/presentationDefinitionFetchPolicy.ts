/** OID4VP remote presentation-definition fetch timeout (ms). Default 15_000. */
export const PRESENTATION_DEFINITION_FETCH_TIMEOUT_MS =
  Number(process.env.EXPO_PUBLIC_PRESENTATION_DEFINITION_FETCH_TIMEOUT_MS) || 15_000

/** Max presentation-definition response body size (bytes). Default 65_536. */
export const PRESENTATION_DEFINITION_MAX_BYTES =
  Number(process.env.EXPO_PUBLIC_PRESENTATION_DEFINITION_MAX_BYTES) || 65_536
