import express from 'express'
import { randomUUID } from 'crypto'
import swaggerUi from 'swagger-ui-express'

import { buildIssuerSignedMdoc } from './documentBuilder'
import { createOpenApiSpec } from './openapi'

export const DEFAULT_CREDENTIAL_CONFIGURATION_ID = 'TestMdocDrivingLicence'
export const DEFAULT_DOCTYPE = 'org.iso.18013.5.1.mDL'

type OfferRecord = {
  credentialConfigurationId: string
  docType: string
  preAuthorizedCode: string
}

type TokenRecord = {
  credentialConfigurationId: string
  docType: string
}

export type CreateMdocIssuerAppOptions = {
  issuerBaseUrl: string
}

function createCredentialOffer(issuerBaseUrl: string, record: OfferRecord): {
  credentialOffer: Record<string, unknown>
  offerUri: string
} {
  const credentialOffer = {
    credential_issuer: issuerBaseUrl,
    credential_configuration_ids: [record.credentialConfigurationId],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': record.preAuthorizedCode,
      },
    },
  }

  const params = new URLSearchParams({
    credential_offer: JSON.stringify(credentialOffer),
  })

  return {
    credentialOffer,
    offerUri: `openid-credential-offer://?${params.toString()}`,
  }
}

export function createMdocIssuerApp(options: CreateMdocIssuerAppOptions): express.Express {
  const app = express()
  const offers = new Map<string, OfferRecord>()
  const accessTokens = new Map<string, TokenRecord>()

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false }))

  const spec = createOpenApiSpec(options.issuerBaseUrl)
  app.use('/api-docs', swaggerUi.serve as unknown as express.RequestHandler[], swaggerUi.setup(spec) as unknown as express.RequestHandler)
  app.get('/api-docs.json', (_req, res) => res.json(spec))

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.get('/.well-known/openid-credential-issuer', (_req, res) => {
    res.status(200).json({
      credential_issuer: options.issuerBaseUrl,
      credential_endpoint: `${options.issuerBaseUrl}/credential`,
      authorization_servers: [options.issuerBaseUrl],
      credential_configurations_supported: {
        [DEFAULT_CREDENTIAL_CONFIGURATION_ID]: {
          format: 'mso_mdoc',
          doctype: DEFAULT_DOCTYPE,
          cryptographic_binding_methods_supported: ['did:key'],
          credential_signing_alg_values_supported: ['ES256'],
          display: [{ name: 'ETDA Test mdoc Driving Licence' }],
        },
      },
    })
  })

  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.status(200).json({
      issuer: options.issuerBaseUrl,
      token_endpoint: `${options.issuerBaseUrl}/token`,
      grant_types_supported: ['urn:ietf:params:oauth:grant-type:pre-authorized_code'],
      token_endpoint_auth_methods_supported: ['none'],
    })
  })

  app.post('/offers', (req, res) => {
    const credentialConfigurationId =
      typeof req.body?.credentialConfigurationId === 'string'
        ? req.body.credentialConfigurationId
        : DEFAULT_CREDENTIAL_CONFIGURATION_ID

    if (credentialConfigurationId !== DEFAULT_CREDENTIAL_CONFIGURATION_ID) {
      res.status(400).json({ error: 'unsupported_credential_configuration' })
      return
    }

    const preAuthorizedCode = randomUUID()
    const offer = {
      credentialConfigurationId,
      docType: DEFAULT_DOCTYPE,
      preAuthorizedCode,
    }
    offers.set(preAuthorizedCode, offer)

    const { credentialOffer, offerUri } = createCredentialOffer(options.issuerBaseUrl, offer)

    res.status(201).json({
      offerUri,
      credentialOffer,
      credentialConfigurationId,
      preAuthorizedCode,
    })
  })

  app.post('/token', (req, res) => {
    if (req.body?.grant_type !== 'urn:ietf:params:oauth:grant-type:pre-authorized_code') {
      res.status(400).json({ error: 'unsupported_grant_type' })
      return
    }

    const code = req.body?.['pre-authorized_code']
    if (typeof code !== 'string' || !offers.has(code)) {
      res.status(400).json({ error: 'invalid_grant' })
      return
    }

    const offer = offers.get(code)!
    offers.delete(code)

    const accessToken = randomUUID()
    const cNonce = randomUUID()
    accessTokens.set(accessToken, {
      credentialConfigurationId: offer.credentialConfigurationId,
      docType: offer.docType,
    })

    res.status(200).json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 300,
      c_nonce: cNonce,
      c_nonce_expires_in: 300,
    })
  })

  app.post('/credential', (req, res) => {
    const authorization = req.header('authorization')
    const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : null
    if (!token || !accessTokens.has(token)) {
      res.status(401).json({ error: 'invalid_token' })
      return
    }

    const accessToken = accessTokens.get(token)!
    if (req.body?.format !== 'mso_mdoc' || req.body?.doctype !== accessToken.docType) {
      res.status(400).json({ error: 'unsupported_credential_format' })
      return
    }

    const credential = buildIssuerSignedMdoc({
      docType: accessToken.docType,
      namespaces: {
        'org.iso.18013.5.1': {
          family_name: 'Developer',
          given_name: 'ETDA',
          document_number: 'TH-123456',
          issuing_country: 'TH',
        },
      },
    })

    accessTokens.delete(token)

    res.status(200).json({
      format: 'mso_mdoc',
      credential: credential.toString('base64url'),
    })
  })

  return app
}
