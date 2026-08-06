export type CredentialFormatName = 'dc+sd-jwt' | 'mso_mdoc'

export type ConsistencyStatus = 'verified' | 'warning' | 'mismatch'

export type CredentialFormatRecord = {
  format: CredentialFormatName
  credentialConfigurationId: string
  rawCredentialRef: string
  issuedAt?: string
  expiresAt?: string
  holderBindingRef?: string
}

export type LogicalCredential = {
  logicalCredentialId: string
  issuer: string
  documentType: string
  subjectId?: string
  documentId?: string
  formats: Partial<Record<CredentialFormatName, CredentialFormatRecord>>
  consistencyStatus: ConsistencyStatus
  warnings: string[]
}

export type DualFormatConfigurationGroup = {
  familyKey: string
  logicalCredentialIdHint?: string
  sdJwt?: {
    configurationId: string
    requestId: string
    rawConfiguration: Record<string, unknown>
  }
  mdoc?: {
    configurationId: string
    requestId: string
    rawConfiguration: Record<string, unknown>
  }
}
