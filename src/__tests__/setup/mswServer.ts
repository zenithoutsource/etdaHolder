import { setupServer } from 'msw/node'

import { issuerHandlers } from './handlers/issuer'
import { verifierHandlers } from './handlers/verifier'
import { walletApiHandlers } from './handlers/walletApi'

export const mswServer = setupServer(...walletApiHandlers, ...issuerHandlers, ...verifierHandlers)
