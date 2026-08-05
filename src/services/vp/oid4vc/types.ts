export type PresentationFlowOrigin = 'scan' | 'same-device' | 'my-qr' | 'issuer-renewal'

export type ProtocolPath = 'legacy' | 'oid4vc'

export type AuthorizationRequestMaterial = {
  rawBody?: string
  byValueParams?: Record<string, string>
  requestUri?: string
}

export type Oid4vcAdapterContext = {
  authorizationRequestPayload: Record<string, unknown>
  authorizationResponsePayload?: Record<string, unknown>
}
