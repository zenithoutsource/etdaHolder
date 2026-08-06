import { jsonContent, responseRef, schemaRef } from './openApiHelpers'

const bearerSecurity = [{ bearerAuth: [] }]

const examples = {
  email: 'developer@example.invalid',
  pin: '593817',
  accountId: '11111111-1111-4111-8111-111111111111',
  walletId: '22222222-2222-4222-8222-222222222222',
  holderDid: 'did:key:zSyntheticHolder',
  credentialJwt: 'synthetic.jwt.vc',
  sessionJwt: 'synthetic.jwt.value',
} as const

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
    { name: 'Development' },
  ],
  paths: {
    '/wallet-api/auth/email-status': {
      post: {
        tags: ['Authentication'],
        summary: 'Check whether a Wallet Account exists',
        description:
          'Checks whether an account exists for an email address. This unauthenticated endpoint returns only existence status and applies the handler rate limit.',
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
        summary: 'Register a Wallet Account',
        description:
          'Creates a Wallet Account with an email and six-digit PIN. This unauthenticated endpoint rejects duplicate accounts and validates the supplied registration data.',
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
        summary: 'Log in to a Wallet Account',
        description:
          'Authenticates a Wallet Account using email and a six-digit PIN. This unauthenticated endpoint returns a session token on success and is rate limited by the current handler.',
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
        summary: 'Request a PIN-reset OTP',
        description:
          'Requests a PIN-reset one-time passcode for an email address. This unauthenticated endpoint uses the current handler response behavior and is rate limited.',
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
        summary: 'Verify a PIN-reset OTP',
        description:
          'Verifies a PIN-reset one-time passcode for an email address. This unauthenticated endpoint returns no content when the current handler accepts the OTP and is rate limited.',
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
        summary: 'Set a new Wallet PIN',
        description:
          'Sets a new six-digit Wallet PIN after a valid PIN-reset OTP is supplied. This unauthenticated endpoint returns no content on success and is rate limited.',
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
        summary: 'Log out the current session',
        description:
          'Logs out the current Wallet session according to the current handler behavior. No Bearer authentication is declared because the current runtime route does not enforce it.',
        responses: {
          200: { description: 'OK', ...jsonContent(schemaRef('EmptyObject')) },
        },
      },
    },
    '/wallet-api/wallet/accounts/wallets': {
      get: {
        tags: ['Wallets'],
        summary: 'List wallets for the authenticated account',
        description:
          'Lists wallets belonging to the authenticated Wallet Account. A Bearer JWT is required and the response includes the account identifier with wallet summaries.',
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
        summary: 'Import a finalized credential',
        description:
          'Imports a finalized credential into the selected wallet. A Bearer JWT is required; the handler validates access to the wallet and stores the supplied credential JWT and Holder DID.',
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
        summary: 'Register an Expo push token',
        description:
          'Registers an Expo push token for a Holder DID so the development backend can send notifications. No Bearer authentication is declared because the current runtime route does not enforce it.',
        requestBody: { required: true, ...jsonContent(schemaRef('PushTokenRequest')) },
        responses: {
          200: { description: 'OK', ...jsonContent(schemaRef('PushTokenResponse')) },
          400: responseRef('BadRequest'),
        },
      },
    },
    '/wallet-api/wallet-attestations': {
      post: {
        tags: ['Development'],
        summary: 'Issue development Wallet attestations',
        description:
          'Issues development-only Wallet attestation mocks for the supplied Ed25519 public JWK. This unauthenticated endpoint currently returns unsigned alg: none development mocks and must never be used in production.',
        requestBody: {
          required: true,
          ...jsonContent(schemaRef('WalletAttestationRequest')),
        },
        responses: {
          201: {
            description: 'Created',
            ...jsonContent(schemaRef('WalletAttestationResponse')),
          },
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
        properties: { email: { type: 'string', format: 'email', example: examples.email } },
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
          name: { type: 'string', example: 'Synthetic User' },
          email: { type: 'string', format: 'email', example: examples.email },
          pin: { type: 'string', pattern: '^\\d{6}$', example: examples.pin },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['type', 'email', 'pin'],
        properties: {
          type: { type: 'string', enum: ['email'] },
          email: { type: 'string', format: 'email', example: examples.email },
          pin: { type: 'string', pattern: '^\\d{6}$', example: examples.pin },
        },
      },
      LoginResponse: {
        type: 'object',
        required: ['id', 'token'],
        properties: {
          id: { type: 'string', format: 'uuid', example: examples.accountId },
          token: { type: 'string', example: examples.sessionJwt },
        },
      },
      PinResetRequest: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email', example: examples.email } },
      },
      PinResetVerifyRequest: {
        type: 'object',
        required: ['email', 'otp'],
        properties: {
          email: { type: 'string', format: 'email', example: examples.email },
          otp: { type: 'string', pattern: '^\\d{6}$', example: '246802' },
        },
      },
      PinResetConfirmRequest: {
        type: 'object',
        required: ['email', 'otp', 'pin'],
        properties: {
          email: { type: 'string', format: 'email', example: examples.email },
          otp: { type: 'string', pattern: '^\\d{6}$', example: '246802' },
          pin: { type: 'string', pattern: '^\\d{6}$', example: examples.pin },
        },
      },
      WalletSummary: {
        type: 'object',
        required: ['id', 'name', 'createdOn', 'addedOn', 'permission'],
        properties: {
          id: { type: 'string', format: 'uuid', example: examples.walletId },
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
          jwt: { type: 'string', example: examples.credentialJwt },
          associated_did: { type: 'string', example: examples.holderDid },
        },
      },
      CredentialImportResponse: {
        type: 'object',
        required: ['id', 'wallet', 'document', 'format', 'pending', 'addedOn'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          wallet: { type: 'string', format: 'uuid' },
          document: { type: 'string', example: examples.credentialJwt },
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
          holderDid: { type: 'string', example: examples.holderDid },
        },
      },
      PushTokenResponse: {
        type: 'object',
        required: ['ok'],
        properties: { ok: { type: 'boolean', enum: [true] } },
      },
      WalletAttestationJwk: {
        type: 'object',
        required: ['kty', 'crv', 'x'],
        properties: {
          kty: { type: 'string', enum: ['OKP'] },
          crv: { type: 'string', enum: ['Ed25519'] },
          x: { type: 'string', example: 'SyntheticEd25519PublicKey' },
        },
      },
      WalletAttestationRequest: {
        type: 'object',
        required: ['pubKAttestJwk'],
        properties: {
          pubKAttestJwk: schemaRef('WalletAttestationJwk'),
        },
      },
      WalletAttestationResponse: {
        type: 'object',
        required: ['wua', 'wia', 'expiresAt'],
        properties: {
          wua: { type: 'string', example: 'synthetic.wua.' },
          wia: { type: 'string', example: 'synthetic.wia.' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
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
