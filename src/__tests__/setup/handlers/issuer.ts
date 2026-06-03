import { http, HttpResponse } from 'msw'

export const issuerHandlers = [
  http.get('https://issuer.example.com/.well-known/openid-credential-issuer', () =>
    HttpResponse.json({
      credential_issuer: 'https://issuer.example.com',
      credential_endpoint: 'https://issuer.example.com/credential',
      credential_configurations_supported: {
        ThaiNationalID: {
          format: 'jwt_vc_json',
          credential_definition: { type: ['VerifiableCredential', 'ThaiNationalID'] },
          display: [{ name: 'Thai National ID', locale: 'en' }],
        },
      },
    }),
  ),

  http.post('https://issuer.example.com/token', () =>
    HttpResponse.json({
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 300,
      c_nonce: 'mock-c-nonce',
    }),
  ),

  http.post('https://issuer.example.com/credential', () =>
    HttpResponse.json({
      credentials: [{ credential: 'eyJhbGciOiJFUzI1NiJ9.mock.signature' }],
      format: 'jwt_vc_json',
    }),
  ),
]
