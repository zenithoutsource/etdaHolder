import { issuerHandlers } from './issuer'
import { walletApiHandlers } from './walletApi'

export const handlers = [...issuerHandlers, ...walletApiHandlers]
