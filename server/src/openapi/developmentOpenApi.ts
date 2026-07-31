import { jsonContent, responseRef, schemaRef } from './openApiHelpers'

const htmlContent = (description: string, example?: string) => ({
  description,
  content: {
    'text/html': {
      schema: { type: 'string' },
      ...(example ? { example } : {}),
    },
  },
})

const sessionIdParam = {
  name: 'sessionId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const

const sessionQueryParam = {
  name: 's',
  in: 'query',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'Presentation session identifier',
} as const

const credentialIdQuery = {
  name: 'credentialId',
  in: 'query',
  required: true,
  schema: { type: 'string', example: 'credential-synthetic-1' },
} as const

const placeholders = {
  credentialId: 'credential-synthetic-1',
  holderDid: 'did:key:zSyntheticHolder',
  rawVc: 'synthetic.jwt.vc',
  popJwt: 'synthetic.pop.jwt',
  vpToken: 'synthetic.sd-jwt~synthetic.kb-jwt',
  pushToken: 'ExponentPushToken[synthetic-device]',
} as const

export const developmentOpenApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Development API',
    version: '1.0.0',
    description:
      'Local simulation and diagnostic operations. These routes are not available in production.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Development presentation sessions' },
    { name: 'Credential suspension' },
    { name: 'Credential lifecycle' },
    { name: 'Holder revocation' },
    { name: 'Push simulation' },
    { name: 'Credential renewal' },
  ],
  paths: {
    '/dev/vp-session': {
      post: {
        tags: ['Development presentation sessions'],
        summary: 'Create a development presentation session',
        description:
          'Creates a local presentation session without a production verify URL. Not available in production.',
        responses: {
          201: {
            description: 'Created',
            ...jsonContent(schemaRef('DevPresentationSession')),
          },
        },
      },
    },
    '/dev/vp-session/{sessionId}': {
      put: {
        tags: ['Development presentation sessions'],
        summary: 'Upload a development presentation token',
        description:
          'Uploads an SD-JWT VP for a development session. Accepts any credentialType unlike the v1 gateway.',
        parameters: [sessionIdParam],
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('DevPresentationUploadRequest')),
        },
        responses: {
          200: {
            description: 'OK',
            ...jsonContent(schemaRef('PresentationUploadResponse')),
          },
          400: responseRef('BadRequest'),
          404: responseRef('NotFound'),
          409: responseRef('Conflict'),
          410: responseRef('Gone'),
        },
      },
    },
    '/dev/vp-session/{sessionId}/status': {
      get: {
        tags: ['Development presentation sessions'],
        summary: 'Poll development session status',
        parameters: [sessionIdParam],
        responses: {
          200: {
            description: 'OK',
            ...jsonContent(schemaRef('PresentationStatusResponse')),
          },
          404: {
            description: 'Not Found',
            ...jsonContent({
              type: 'object',
              required: ['status'],
              properties: { status: { type: 'string', enum: ['not-found'] } },
            }),
          },
        },
      },
    },
    '/dev/vp-verify': {
      get: {
        tags: ['Development presentation sessions'],
        summary: 'Verify a development presentation in the browser',
        parameters: [sessionQueryParam],
        responses: {
          200: htmlContent('Verification result HTML'),
          202: {
            description: 'Presentation has not been uploaded yet',
            headers: {
              'Retry-After': {
                description: 'Seconds before retrying',
                schema: { type: 'integer', example: 2 },
              },
            },
            content: {
              'text/html': {
                schema: { type: 'string' },
                example: '<!doctype html><html><body>Presentation pending</body></html>',
              },
            },
          },
          404: htmlContent('Session not found HTML'),
          409: htmlContent('Session already consumed HTML'),
          410: htmlContent('Session expired HTML'),
        },
      },
    },
    '/wallet-api/dev/wallet/suspension-status': {
      get: {
        tags: ['Credential suspension'],
        summary: 'List issuer suspension records',
        responses: {
          200: {
            description: 'OK',
            ...jsonContent(schemaRef('SuspensionStatusResponse')),
          },
        },
      },
    },
    '/wallet-api/dev/wallet/renewal-status': {
      get: {
        tags: ['Credential renewal'],
        summary: 'List credential renewal states',
        responses: {
          200: {
            description: 'OK',
            ...jsonContent(schemaRef('RenewalStatusResponse')),
          },
        },
      },
    },
    '/wallet-api/dev/presentation/suspend-access': {
      post: {
        tags: ['Credential suspension'],
        summary: 'Simulate presentation access suspension',
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('SuspendPresentationAccessRequest')),
        },
        responses: {
          201: {
            description: 'Created',
            ...jsonContent(schemaRef('SuspendPresentationAccessResponse')),
          },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/dev/issuer/suspend': {
      post: {
        tags: ['Credential suspension'],
        summary: 'Simulate issuer credential suspension',
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('IssuerSuspendRequest')),
        },
        responses: {
          201: {
            description: 'Created',
            ...jsonContent(schemaRef('IssuerSuspendResponse')),
          },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/dev/wallet/mark-used': {
      post: {
        tags: ['Credential lifecycle'],
        summary: 'Mark a credential as used',
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('CredentialIdRequest')),
        },
        responses: {
          201: {
            description: 'Created',
            ...jsonContent(schemaRef('MarkUsedResponse')),
          },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/dev/wallet/used-status': {
      get: {
        tags: ['Credential lifecycle'],
        summary: 'Query credential used status',
        parameters: [credentialIdQuery],
        responses: {
          200: {
            description: 'OK',
            ...jsonContent(schemaRef('UsedStatusResponse')),
          },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/dev/issuer/holder-revoke/nonce': {
      post: {
        tags: ['Holder revocation'],
        summary: 'Issue a holder-revoke PoP nonce',
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('HolderRevokeNonceRequest')),
        },
        responses: {
          201: {
            description: 'Created',
            ...jsonContent(schemaRef('HolderRevokeNonceResponse')),
          },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/dev/issuer/holder-revoke': {
      post: {
        tags: ['Holder revocation'],
        summary: 'Confirm holder revocation with PoP',
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('HolderRevokeRequest')),
        },
        responses: {
          201: {
            description: 'Created',
            ...jsonContent(schemaRef('HolderRevokeResponse')),
          },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/dev/wallet/revoke-status': {
      get: {
        tags: ['Holder revocation'],
        summary: 'Query holder revocation status',
        parameters: [credentialIdQuery],
        responses: {
          200: {
            description: 'OK',
            ...jsonContent(schemaRef('RevokeStatusResponse')),
          },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/dev/webhook/credential-event': {
      post: {
        tags: ['Push simulation'],
        summary: 'Simulate a credential push event',
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('CredentialEventWebhookRequest')),
        },
        responses: {
          200: {
            description: 'OK',
            ...jsonContent(schemaRef('CredentialEventWebhookResponse')),
          },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/dev/wallet/renewal-request': {
      post: {
        tags: ['Credential renewal'],
        summary: 'Start a credential renewal simulation',
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('RenewalRequestBody')),
        },
        responses: {
          201: {
            description: 'Created',
            ...jsonContent(schemaRef('RenewalRequestResponse')),
          },
          400: responseRef('BadRequest'),
          502: responseRef('BadGateway'),
          503: responseRef('ServiceUnavailable'),
        },
      },
    },
    '/wallet-api/dev/wallet/renewal-vp/response': {
      post: {
        tags: ['Credential renewal'],
        summary: 'Submit a renewal VP response',
        description:
          'Accepts JSON or form-encoded vp_token and state fields for the renewal OID4VP direct-post stub.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: schemaRef('RenewalVpResponseRequest') },
            'application/x-www-form-urlencoded': {
              schema: schemaRef('RenewalVpResponseRequest'),
            },
          },
        },
        responses: {
          200: {
            description: 'OK',
            ...jsonContent(schemaRef('RenewalVpResponseResult')),
          },
          400: responseRef('BadRequest'),
          404: responseRef('NotFound'),
          409: responseRef('Conflict'),
        },
      },
    },
  },
  components: {
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string', example: 'Bad Request' } },
      },
      DevPresentationSession: {
        type: 'object',
        required: ['sessionId', 'nonce', 'expiresAt'],
        properties: {
          sessionId: { type: 'string', format: 'uuid' },
          nonce: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      DevPresentationUploadRequest: {
        type: 'object',
        required: ['vpToken', 'credentialType'],
        properties: {
          vpToken: { type: 'string', example: placeholders.vpToken },
          credentialType: { type: 'string', example: 'ThaiNationalID' },
        },
      },
      PresentationUploadResponse: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean', enum: [true] } },
      },
      PresentationStatusResponse: {
        type: 'object',
        required: ['status', 'expiresAt'],
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'ready', 'verified', 'verify_failed', 'expired'],
          },
          expiresAt: { type: 'string', format: 'date-time' },
          reason: { type: 'string' },
        },
      },
      SuspensionStatusResponse: {
        type: 'object',
        required: ['suspensions'],
        properties: {
          suspensions: {
            type: 'array',
            items: schemaRef('IssuerSuspendResponse'),
          },
        },
      },
      RenewalStatusResponse: {
        type: 'object',
        required: ['renewals'],
        properties: {
          renewals: {
            type: 'array',
            items: schemaRef('RenewalStatusEntry'),
          },
        },
      },
      RenewalStatusEntry: {
        type: 'object',
        required: ['credentialId', 'state'],
        properties: {
          credentialId: { type: 'string', example: placeholders.credentialId },
          state: {
            type: 'string',
            enum: ['requested', 'offer-ready', 'revoked'],
          },
          offerUri: { type: 'string' },
          revokedAt: { type: 'string', format: 'date-time' },
        },
      },
      SuspendPresentationAccessRequest: {
        type: 'object',
        required: ['eventId', 'credentialId', 'partyName'],
        properties: {
          eventId: { type: 'string', example: 'event-synthetic-1' },
          credentialId: { type: 'string', example: placeholders.credentialId },
          partyName: { type: 'string', example: 'Synthetic Verifier' },
        },
      },
      SuspendPresentationAccessResponse: {
        type: 'object',
        required: ['eventId', 'credentialId', 'partyName', 'requestedAt'],
        properties: {
          eventId: { type: 'string' },
          credentialId: { type: 'string' },
          partyName: { type: 'string' },
          requestedAt: { type: 'string', format: 'date-time' },
        },
      },
      IssuerSuspendRequest: {
        type: 'object',
        required: ['credentialId'],
        properties: {
          credentialId: { type: 'string', example: placeholders.credentialId },
          suspendedAt: { type: 'string', format: 'date-time' },
          acknowledgedAt: { type: 'string', format: 'date-time' },
          reasonCode: { type: 'string' },
          issuerRef: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      IssuerSuspendResponse: {
        type: 'object',
        required: ['credentialId', 'suspendedAt', 'updatedAt'],
        properties: {
          credentialId: { type: 'string' },
          suspendedAt: { type: 'string', format: 'date-time' },
          acknowledgedAt: { type: 'string', format: 'date-time' },
          reasonCode: { type: 'string' },
          issuerRef: { type: 'string' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CredentialIdRequest: {
        type: 'object',
        required: ['credentialId'],
        properties: {
          credentialId: { type: 'string', example: placeholders.credentialId },
        },
      },
      MarkUsedResponse: {
        type: 'object',
        required: ['used', 'credentialId'],
        properties: {
          used: { type: 'boolean', enum: [true] },
          credentialId: { type: 'string' },
        },
      },
      UsedStatusResponse: {
        type: 'object',
        required: ['used', 'credentialId'],
        properties: {
          used: { type: 'boolean' },
          credentialId: { type: 'string' },
        },
      },
      HolderRevokeNonceRequest: {
        type: 'object',
        required: ['credentialId', 'holderDid'],
        properties: {
          credentialId: { type: 'string', example: placeholders.credentialId },
          holderDid: { type: 'string', example: placeholders.holderDid },
        },
      },
      HolderRevokeNonceResponse: {
        type: 'object',
        required: ['nonce', 'audience', 'expiresAt'],
        properties: {
          nonce: { type: 'string' },
          audience: { type: 'string' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      HolderRevokeRequest: {
        type: 'object',
        required: ['credentialId', 'holderDid', 'popJwt'],
        properties: {
          credentialId: { type: 'string', example: placeholders.credentialId },
          holderDid: { type: 'string', example: placeholders.holderDid },
          popJwt: { type: 'string', example: placeholders.popJwt },
        },
      },
      HolderRevokeResponse: {
        type: 'object',
        required: ['status', 'credentialId', 'confirmedAt'],
        properties: {
          status: { type: 'string', enum: ['revoked'] },
          credentialId: { type: 'string' },
          confirmedAt: { type: 'string', format: 'date-time' },
        },
      },
      RevokeStatusResponse: {
        type: 'object',
        required: ['status', 'credentialId'],
        properties: {
          status: { type: 'string', enum: ['none', 'revoked'] },
          credentialId: { type: 'string' },
          confirmedAt: { type: 'string', format: 'date-time' },
        },
      },
      CredentialEventWebhookRequest: {
        type: 'object',
        required: ['event', 'holderDid', 'credentialId', 'credentialType'],
        properties: {
          event: {
            type: 'string',
            enum: [
              'renewal-ready',
              'renewal-required',
              'issuer-suspended',
              'cleanup-pending',
              'old-revoked',
            ],
          },
          holderDid: { type: 'string', example: placeholders.holderDid },
          credentialId: { type: 'string', example: placeholders.credentialId },
          credentialType: { type: 'string', example: 'ThaiNationalID' },
        },
      },
      CredentialEventWebhookResponse: {
        type: 'object',
        required: ['delivered'],
        properties: { delivered: { type: 'boolean' } },
      },
      RenewalRequestBody: {
        type: 'object',
        required: [
          'credentialId',
          'credentialType',
          'oldHolderDid',
          'newHolderDid',
          'rawVc',
        ],
        properties: {
          credentialId: { type: 'string', example: placeholders.credentialId },
          credentialType: { type: 'string', example: 'ThaiNationalID' },
          oldHolderDid: { type: 'string', example: placeholders.holderDid },
          newHolderDid: { type: 'string', example: placeholders.holderDid },
          rawVc: { type: 'string', example: placeholders.rawVc },
        },
      },
      RenewalRequestResponse: {
        type: 'object',
        required: ['accepted', 'authorizationRequest'],
        properties: {
          accepted: { type: 'boolean', enum: [true] },
          authorizationRequest: { type: 'string' },
        },
      },
      RenewalVpResponseRequest: {
        type: 'object',
        required: ['vp_token', 'state'],
        properties: {
          vp_token: { type: 'string', example: placeholders.vpToken },
          state: { type: 'string', example: placeholders.credentialId },
        },
      },
      RenewalVpResponseResult: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['verified'] } },
      },
    },
    responses: {
      BadRequest: { description: 'Bad Request', ...jsonContent(schemaRef('ErrorResponse')) },
      NotFound: { description: 'Not Found', ...jsonContent(schemaRef('ErrorResponse')) },
      Conflict: { description: 'Conflict', ...jsonContent(schemaRef('ErrorResponse')) },
      UnprocessableEntity: {
        description: 'Unprocessable Entity',
        ...jsonContent(schemaRef('ErrorResponse')),
      },
      BadGateway: { description: 'Bad Gateway', ...jsonContent(schemaRef('ErrorResponse')) },
      ServiceUnavailable: {
        description: 'Service Unavailable',
        ...jsonContent(schemaRef('ErrorResponse')),
      },
    },
  },
} as const
