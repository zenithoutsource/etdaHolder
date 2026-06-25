export function createOpenApiSpec(issuerBaseUrl: string): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'ETDA mDOC Test Issuer',
      version: '1.0.0',
      description: 'OID4VCI-compatible test issuer for ISO 18013-5 mDOC credentials. Development use only.',
    },
    servers: [{ url: issuerBaseUrl }],
    paths: {
      '/health': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' } } } } } } },
        },
      },
      '/.well-known/openid-credential-issuer': {
        get: {
          summary: 'OID4VCI Issuer Metadata',
          responses: { '200': { description: 'Issuer metadata', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
      '/.well-known/oauth-authorization-server': {
        get: {
          summary: 'OAuth Authorization Server Metadata',
          responses: { '200': { description: 'Authorization server metadata', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
      '/offers': {
        post: {
          summary: 'Create credential offer',
          description: 'Creates a pre-authorized credential offer. Returns an openid-credential-offer:// URI.',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    credentialConfigurationId: { type: 'string', default: 'TestMdocDrivingLicence' },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Offer created',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      offerUri: { type: 'string', example: 'openid-credential-offer://...' },
                      credentialOffer: { type: 'object' },
                      credentialConfigurationId: { type: 'string' },
                      preAuthorizedCode: { type: 'string', format: 'uuid' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Unsupported credential configuration' },
          },
        },
      },
      '/token': {
        post: {
          summary: 'Exchange pre-authorized code for access token',
          description: 'OID4VCI token endpoint. Accepts pre-authorized_code grant type.',
          requestBody: {
            required: true,
            content: {
              'application/x-www-form-urlencoded': {
                schema: {
                  type: 'object',
                  required: ['grant_type', 'pre-authorized_code'],
                  properties: {
                    grant_type: { type: 'string', enum: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'] },
                    'pre-authorized_code': { type: 'string', description: 'Code from /offers response' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Token issued',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      access_token: { type: 'string', format: 'uuid' },
                      token_type: { type: 'string', example: 'Bearer' },
                      expires_in: { type: 'integer', example: 300 },
                      c_nonce: { type: 'string', format: 'uuid' },
                      c_nonce_expires_in: { type: 'integer', example: 300 },
                    },
                  },
                },
              },
            },
            '400': { description: 'Invalid grant or unsupported grant type' },
          },
        },
      },
      '/credential': {
        post: {
          summary: 'Issue mDOC credential',
          description: 'Returns a base64url-encoded CBOR mDOC (ISO 18013-5 IssuerSigned document). Single-use: token is deleted after issuance.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['format', 'doctype'],
                  properties: {
                    format: { type: 'string', enum: ['mso_mdoc'] },
                    doctype: { type: 'string', example: 'org.iso.18013.5.1.mDL' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'mDOC credential issued',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      format: { type: 'string', example: 'mso_mdoc' },
                      credential: { type: 'string', description: 'Base64url-encoded CBOR mDOC' },
                    },
                  },
                },
              },
            },
            '400': { description: 'Unsupported credential format' },
            '401': { description: 'Invalid or missing access token' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Access token from /token endpoint',
        },
      },
    },
  }
}
