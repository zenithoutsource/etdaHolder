/** OID4VP did:web DID document fetch timeout (ms). Default 15_000. */
export const DID_WEB_FETCH_TIMEOUT_MS =
  Number(process.env.EXPO_PUBLIC_DID_WEB_FETCH_TIMEOUT_MS) || 15_000

/** Max did:web DID document response body size (UTF-8 bytes). Default 65_536. */
export const DID_WEB_MAX_BYTES =
  Number(process.env.EXPO_PUBLIC_DID_WEB_MAX_BYTES) || 65_536
