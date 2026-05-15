import type { FastifyInstance } from 'fastify'
import type { ConnectorInfo } from '../connector-info.js'
import type { PairingStore } from '../../security/pairing.js'
import type { TokenAuthOptions } from '../../security/token-auth.js'

export interface RouteRegistrationContext {
  app: FastifyInstance
  auth?: TokenAuthOptions
  connectorInfo: ConnectorInfo
  pairingStore: PairingStore
}

export type RouteRegistrationStep = (
  execute: (context: RouteRegistrationContext) => Promise<void>,
  context: RouteRegistrationContext,
) => Promise<void>
