const jsonContent = (schema: Record<string, unknown>) => ({
  content: {
    'application/json': { schema },
  },
})

const schemaRef = (name: string) => ({
  $ref: `#/components/schemas/${name}`,
})

const responseRef = (name: string) => ({
  $ref: `#/components/responses/${name}`,
})

const bearerSecurity = [{ bearerAuth: [] }]

export const walletOpenApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Wallet Backend API',
    version: '1.0.0',
    description:
      'Normal Wallet account, session, wallet, credential import, and push-token operations.',
  },
  servers: [{ url: '/' }],
  tags: [
    { name: 'Authentication' },
    { name: 'Wallets' },
    { name: 'Credentials' },
    { name: 'Push notifications' },
  ],
  paths: {
    '/wallet-api/auth/email-status': {
      post: {
        tags: ['Authentication'],
        requestBody: { required: true, ...jsonContent(schemaRef('EmailStatusRequest')) },
        responses: {
          200: { description: 'OK', ...jsonContent(schemaRef('EmailStatusResponse')) },
          400: responseRef('BadRequest'),
          429: responseRef('TooManyRequests'),
          500: responseRef('InternalServerError'),
        },
      },
    },
    '/wallet-api/auth/register': {
      post: {
        tags: ['Authentication'],
        requestBody: { required: true, ...jsonContent(schemaRef('RegisterRequest')) },
        responses: {
          201: { description: 'Created' },
          400: responseRef('BadRequest'),
          409: responseRef('Conflict'),
          500: responseRef('InternalServerError'),
        },
      },
    },
    '/wallet-api/auth/login': {
      post: {
        tags: ['Authentication'],
        requestBody: { required: true, ...jsonContent(schemaRef('LoginRequest')) },
        responses: {
          200: { description: 'OK', ...jsonContent(schemaRef('LoginResponse')) },
          400: responseRef('BadRequest'),
          429: responseRef('TooManyRequests'),
          500: responseRef('InternalServerError'),
        },
      },
    },
    '/wallet-api/auth/pin-reset/request': {
      post: {
        tags: ['Authentication'],
        requestBody: { required: true, ...jsonContent(schemaRef('PinResetRequest')) },
        responses: {
          204: { description: 'No Content' },
          400: responseRef('BadRequest'),
          429: responseRef('TooManyRequests'),
          500: responseRef('InternalServerError'),
        },
      },
    },
    '/wallet-api/auth/pin-reset/verify': {
      post: {
        tags: ['Authentication'],
        requestBody: { required: true, ...jsonContent(schemaRef('PinResetVerifyRequest')) },
        responses: {
          204: { description: 'No Content' },
          400: responseRef('BadRequest'),
          429: responseRef('TooManyRequests'),
          500: responseRef('InternalServerError'),
        },
      },
    },
    '/wallet-api/auth/pin-reset/confirm': {
      post: {
        tags: ['Authentication'],
        requestBody: { required: true, ...jsonContent(schemaRef('PinResetConfirmRequest')) },
        responses: {
          204: { description: 'No Content' },
          400: responseRef('BadRequest'),
          429: responseRef('TooManyRequests'),
          500: responseRef('InternalServerError'),
        },
      },
    },
    '/wallet-api/auth/logout': {
      post: {
        tags: ['Authentication'],
        responses: {
          200: { description: 'OK', ...jsonContent(schemaRef('EmptyObject')) },
        },
      },
    },
    '/wallet-api/wallet/accounts/wallets': {
      get: {
        tags: ['Wallets'],
        security: bearerSecurity,
        responses: {
          200: { description: 'OK', ...jsonContent(schemaRef('WalletListResponse')) },
          401: responseRef('Unauthorized'),
          500: responseRef('InternalServerError'),
        },
      },
    },
    '/wallet-api/wallet/{wallet}/credentials/import': {
      post: {
        tags: ['Credentials'],
        security: bearerSecurity,
        parameters: [
          {
            name: 'wallet',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: { required: true, ...jsonContent(schemaRef('CredentialImportRequest')) },
        responses: {
          201: { description: 'Created', ...jsonContent(schemaRef('CredentialImportResponse')) },
          400: responseRef('BadRequest'),
          401: responseRef('Unauthorized'),
          403: responseRef('Forbidden'),
          500: responseRef('InternalServerError'),
        },
      },
    },
    '/wallet-api/wallet/push-token': {
      post: {
        tags: ['Push notifications'],
        requestBody: { required: true, ...jsonContent(schemaRef('PushTokenRequest')) },
        responses: {
          200: { description: 'OK', ...jsonContent(schemaRef('PushTokenResponse')) },
          400: responseRef('BadRequest'),
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        required: ['message'],
        properties: { message: { type: 'string', example: 'Bad Request' } },
      },
      EmptyObject: { type: 'object', additionalProperties: false },
      EmailStatusRequest: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email', example: 'tester@example.com' } },
      },
      EmailStatusResponse: {
        type: 'object',
        required: ['exists'],
        properties: { exists: { type: 'boolean', example: true } },
      },
      RegisterRequest: {
        type: 'object',
        required: ['type', 'name', 'email', 'pin'],
        properties: {
          type: { type: 'string', enum: ['email'] },
          name: { type: 'string', example: 'Test User' },
          email: { type: 'string', format: 'email', example: 'tester@example.com' },
          pin: { type: 'string', pattern: '^\\d{6}$', example: '135790' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['type', 'email', 'pin'],
        properties: {
          type: { type: 'string', enum: ['email'] },
          email: { type: 'string', format: 'email', example: 'tester@example.com' },
          pin: { type: 'string', pattern: '^\\d{6}$', example: '135790' },
        },
      },
      LoginResponse: {
        type: 'object',
        required: ['id', 'token'],
        properties: {
          id: { type: 'string', format: 'uuid', example: '11111111-1111-4111-8111-111111111111' },
          token: { type: 'string', example: 'synthetic.jwt.value' },
        },
      },
      PinResetRequest: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email', example: 'tester@example.com' } },
      },
      PinResetVerifyRequest: {
        type: 'object',
        required: ['email', 'otp'],
        properties: {
          email: { type: 'string', format: 'email', example: 'tester@example.com' },
          otp: { type: 'string', pattern: '^\\d{6}$', example: '246802' },
        },
      },
      PinResetConfirmRequest: {
        type: 'object',
        required: ['email', 'otp', 'pin'],
        properties: {
          email: { type: 'string', format: 'email', example: 'tester@example.com' },
          otp: { type: 'string', pattern: '^\\d{6}$', example: '246802' },
          pin: { type: 'string', pattern: '^\\d{6}$', example: '135790' },
        },
      },
      WalletSummary: {
        type: 'object',
        required: ['id', 'name', 'createdOn', 'addedOn', 'permission'],
        properties: {
          id: { type: 'string', format: 'uuid', example: '22222222-2222-4222-8222-222222222222' },
          name: { type: 'string', example: 'Default Wallet' },
          createdOn: { type: 'string', format: 'date-time' },
          addedOn: { type: 'string', format: 'date-time' },
          permission: { type: 'string', enum: ['ADMINISTRATE'] },
        },
      },
      WalletListResponse: {
        type: 'object',
        required: ['account', 'wallets'],
        properties: {
          account: { type: 'string', format: 'uuid' },
          wallets: { type: 'array', items: schemaRef('WalletSummary') },
        },
      },
      CredentialImportRequest: {
        type: 'object',
        required: ['jwt', 'associated_did'],
        properties: {
          jwt: { type: 'string', example: 'synthetic.jwt.vc' },
          associated_did: { type: 'string', example: 'did:key:zSyntheticHolder' },
        },
      },
      CredentialImportResponse: {
        type: 'object',
        required: ['id', 'wallet', 'document', 'format', 'pending', 'addedOn'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          wallet: { type: 'string', format: 'uuid' },
          document: { type: 'string', example: 'synthetic.jwt.vc' },
          format: { type: 'string', enum: ['jwt_vc_json'] },
          pending: { type: 'boolean', enum: [false] },
          addedOn: { type: 'string', format: 'date-time' },
        },
      },
      PushTokenRequest: {
        type: 'object',
        required: ['token', 'holderDid'],
        properties: {
          token: { type: 'string', example: 'ExponentPushToken[synthetic-device]' },
          holderDid: { type: 'string', example: 'did:key:zSyntheticHolder' },
        },
      },
      PushTokenResponse: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean', enum: [true] } },
      },
    },
    responses: {
      BadRequest: { description: 'Bad Request', ...jsonContent(schemaRef('ErrorResponse')) },
      Unauthorized: { description: 'Unauthorized', ...jsonContent(schemaRef('ErrorResponse')) },
      Forbidden: { description: 'Forbidden', ...jsonContent(schemaRef('ErrorResponse')) },
      Conflict: { description: 'Conflict', ...jsonContent(schemaRef('ErrorResponse')) },
      TooManyRequests: {
        description: 'Too Many Requests',
        ...jsonContent(schemaRef('ErrorResponse')),
      },
      InternalServerError: {
        description: 'Internal Server Error',
        ...jsonContent(schemaRef('ErrorResponse')),
      },
    },
  },
} as const
